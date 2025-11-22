import { GoogleGenAI, Chat, GenerateContentResponse, Modality } from "@google/genai";
import { addLogEntry } from './aiLogService';
import { triggerUserWebhook } from './webhookService';
import { MODELS } from './aiConfig';
import { generateVideoWithVeo3, checkVideoStatus, uploadImageForVeo3 } from './veo3Service';
import { cropImageToAspectRatio } from "./imageService";
import { decodeBase64, createWavBlob } from '../utils/audioUtils';
import { incrementImageUsage, incrementVideoUsage, getSharedMasterApiKey } from './userService';
import { addHistoryItem } from "./historyService";
import eventBus from "./eventBus";
import { type User } from '../types';
import { getImagenProxyUrl, getVeoProxyUrl } from './apiClient';
import { generateImageWithImagen } from "./imagenV3Service";


const getActiveApiKey = (): string | null => {
    // This key is set and managed by App.tsx, which places the correct key
    // (either user's personal key or a temporary claimed key) into session storage.
    return sessionStorage.getItem('monoklix_session_api_key');
};

const getAiInstance = () => { // No longer async
    const keyToUse = getActiveApiKey();
    if (!keyToUse) {
        throw new Error(`API Key not found. Please set a key in Settings or claim a temporary one.`);
    }
    return new GoogleGenAI({ apiKey: keyToUse });
};

const getCurrentUser = (): User | null => {
    try {
        const savedUserJson = localStorage.getItem('currentUser');
        if (savedUserJson) {
            const user = JSON.parse(savedUserJson) as User;
            if (user && user.id) {
                return user;
            }
        }
    } catch (error) {
        console.error("Failed to parse user from localStorage for usage tracking.", error);
    }
    return null;
};

const getCurrentUserId = (): string | null => {
    return getCurrentUser()?.id ?? null;
};

const MAX_RETRIES = 5;

/**
 * A wrapper function to automatically retry an API call on failure.
 * @param apiCall The asynchronous function to execute.
 * @param onRetry A callback function triggered on each retry attempt.
 * @returns The result of the successful API call.
 * @throws The last error if all retry attempts fail.
 */
async function withRetry<T>(
  apiCall: () => Promise<T>, 
  onRetry: (attempt: number, error: any) => void
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const lowerCaseMessage = errorMessage.toLowerCase();

      // Don't retry on client-side errors like safety blocks or bad requests.
      // Do retry on server errors (5xx) or network issues.
      if (lowerCaseMessage.includes('safety') || 
          (error as any)?.status === 400 ||
          (error as any)?.status === 404) {
        console.log("Non-retriable error detected, throwing immediately.", error);
        throw lastError;
      }
      
      if (attempt < MAX_RETRIES) {
        onRetry(attempt, error);
        // Exponential backoff
        await new Promise(res => setTimeout(res, 1000 * attempt)); 
      }
    }
  }
  throw lastError;
}


export interface MultimodalContent {
    base64: string;
    mimeType: string;
}

/**
 * Creates a new chat session with a given system instruction.
 * @param {string} systemInstruction - The system instruction for the chat model.
 * @returns {Promise<Chat>} A new chat instance.
 */
export const createChatSession = async (systemInstruction: string): Promise<Chat> => {
  const ai = getAiInstance();
  return ai.chats.create({
    model: MODELS.text,
    config: {
      systemInstruction: systemInstruction,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
};

/**
 * Sends a message in a chat session and returns the streaming response.
 * @param {Chat} chat - The chat instance.
 * @param {string} prompt - The user's prompt.
 * @returns {Promise<AsyncGenerator<GenerateContentResponse>>} The streaming response from the model.
 */
export const streamChatResponse = async (chat: Chat, prompt: string) => {
    const model = `${MODELS.text} (stream)`;
    console.debug(`[Chat Prompt Sent]\n---\n${prompt}\n---`);

    const apiCall = async () => {
        return await chat.sendMessageStream({ message: prompt });
    };
    
    try {
        const stream = await withRetry(apiCall, (attempt, error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Attempt ${attempt} to start streamChatResponse failed: ${errorMessage}. Retrying...`);
            addLogEntry({
                model,
                prompt: `${prompt} (Retry ${attempt}/${MAX_RETRIES})`,
                output: `Attempt ${attempt} to start stream failed. Retrying...`,
                tokenCount: 0,
                status: 'Error',
                error: `Retry ${attempt}: ${errorMessage}`
            });
        });
        
        addLogEntry({
            model,
            prompt,
            output: 'Streaming response started...',
            tokenCount: 0, 
            status: 'Success'
        });
        return stream;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLogEntry({
            model,
            prompt,
            output: `Error starting stream after ${MAX_RETRIES} attempts: ${errorMessage}`,
            tokenCount: 0,
            status: 'Error',
            error: errorMessage
        });
        throw error;
    }
};

/**
 * Generates a video from a text prompt and an optional image using the Veo3 service.
 * @param {string} prompt - The text prompt for video generation.
 * @param {string} model - The video generation model to use.
 * @param {string} aspectRatio - The desired aspect ratio.
 * @param {string} resolution - The resolution (used by Veo3).
 * @param {string} negativePrompt - A negative prompt.
 * @param {{ imageBytes: string; mimeType: string }} [image] - Optional image data.
 * @returns {Promise<{ videoFile: File; thumbnailUrl: string | null; }>} The generated video as a File object.
 */
export const generateVideo = async (
    prompt: string,
    model: string,
    aspectRatio: string,
    resolution: string,
    negativePrompt: string,
    image: { imageBytes: string, mimeType: string } | undefined,
    onStatusUpdate?: (status: string) => void
): Promise<{ videoFile: File; thumbnailUrl: string | null; }> => {
    try {
        let processedImage = image;

        if (image && (aspectRatio === '16:9' || aspectRatio === '9:16')) {
            try {
                addLogEntry({ model, prompt: "Cropping reference image...", output: `Cropping to ${aspectRatio}...`, tokenCount: 0, status: "Success" });
                const croppedBase64 = await cropImageToAspectRatio(image.imageBytes, aspectRatio);
                processedImage = {
                    ...image,
                    imageBytes: croppedBase64,
                };
            } catch (cropError) {
                console.error("Image cropping failed, proceeding with original image.", cropError);
                addLogEntry({ model, prompt: "Image cropping failed", output: "Proceeding with original image.", tokenCount: 0, status: "Error", error: cropError instanceof Error ? cropError.message : String(cropError) });
            }
        }

        const veo3AspectRatio = (ar: string): 'landscape' | 'portrait' => {
            if (ar === '9:16' || ar === '3:4') return 'portrait';
            return 'landscape';
        };
        const aspectRatioForVeo3 = veo3AspectRatio(aspectRatio);

        let imageMediaId: string | undefined = undefined;
        let successfulToken: string | null = null;
        
        if (processedImage) {
            addLogEntry({ model, prompt: "Uploading reference image...", output: "In progress...", tokenCount: 0, status: "Success" });
            // UPDATED: Capture the successful token from the upload process
            const uploadResult = await uploadImageForVeo3(processedImage.imageBytes, processedImage.mimeType, aspectRatioForVeo3, onStatusUpdate);
            imageMediaId = uploadResult.mediaId;
            successfulToken = uploadResult.successfulToken;
        }

        const useStandardModel = !model.includes('fast');
        
        addLogEntry({ model, prompt, output: "Starting video generation via proxy...", tokenCount: 0, status: "Success" });
        console.debug(`[Video Prompt Sent]\n---\n${prompt}\n---`);
        
        // UPDATED: Pass the captured token to ensure session consistency
        const { operations: initialOperations, successfulToken: generationToken } = await generateVideoWithVeo3({
            prompt,
            imageMediaId,
            config: {
                aspectRatio: aspectRatioForVeo3,
                useStandardModel,
                authToken: successfulToken || undefined, 
            },
        }, onStatusUpdate);

        const videoCreationToken = generationToken;

        if (!videoCreationToken) {
            throw new Error("Could not determine which auth token was successful for video creation.");
        }

        if (!initialOperations || initialOperations.length === 0) {
            throw new Error("Video generation failed to start. The API did not return any operations.");
        }

        let finalOperations: any[] = initialOperations;
        let finalUrl: string | null = null;
        let thumbnailUrl: string | null = null;
        const POLL_INTERVAL = 10000;

        while (!finalUrl) {
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            addLogEntry({ model, prompt, output: `Checking video status...`, tokenCount: 0, status: "Success" });

            // UPDATED: Check status using the SAME token
            const statusResponse = await checkVideoStatus(finalOperations, videoCreationToken, onStatusUpdate);
            if (!statusResponse?.operations || statusResponse.operations.length === 0) {
                console.warn('⚠️ Empty status response, retrying...');
                continue;
            }

            finalOperations = statusResponse.operations;
            const opStatus = finalOperations[0];
            
            // FIX: Added strict check for FAILED status string
            if (opStatus.status === 'MEDIA_GENERATION_STATUS_FAILED') {
                console.error('❌ Video generation failed with status FAILED. Full operation object:', JSON.stringify(opStatus, null, 2));
                throw new Error("Video generation failed on the server. This often happens if your request was blocked by safety policies. Please try modifying your prompt or using a different image.");
            }

            const isCompleted = opStatus.done === true || ['MEDIA_GENERATION_STATUS_COMPLETED', 'MEDIA_GENERATION_STATUS_SUCCESS', 'MEDIA_GENERATION_STATUS_SUCCESSFUL'].includes(opStatus.status);

            if (isCompleted) {
                finalUrl = opStatus.operation?.metadata?.video?.fifeUrl
                           || opStatus.metadata?.video?.fifeUrl
                           || opStatus.result?.generatedVideo?.[0]?.fifeUrl
                           || opStatus.result?.generatedVideos?.[0]?.fifeUrl
                           || opStatus.video?.fifeUrl
                           || opStatus.fifeUrl;
                
                thumbnailUrl = opStatus.operation?.metadata?.video?.servingBaseUri
                            || opStatus.metadata?.video?.servingBaseUri
                            || null;
                
                if (!finalUrl) {
                    console.error('Operation finished but no video URL was returned. Full operation object:', JSON.stringify(opStatus, null, 2));
                    throw new Error("Video generation finished without an error, but no output was produced. This may happen if your request was blocked by safety policies. Please try modifying your prompt or using a different image.");
                }
            } else if (opStatus.error) {
                throw new Error(`Video generation failed: ${opStatus.error.message || opStatus.error.code || 'Unknown error'}`);
            }
        }
        
        const PROXY_URL = getVeoProxyUrl();
        addLogEntry({ model, prompt, output: "Video ready. Downloading from proxy...", tokenCount: 0, status: "Success" });
        const proxyDownloadUrl = `${PROXY_URL}/api/veo/download-video?url=${encodeURIComponent(finalUrl)}`;

        const response = await fetch(proxyDownloadUrl);
        if (!response.ok) {
            throw new Error(`Background download failed with status: ${response.status}`);
        }
        const blob = await response.blob();
        const videoFile = new File([blob], `monoklix-veo3-${Date.now()}.mp4`, { type: 'video/mp4' });

        return { videoFile, thumbnailUrl };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLogEntry({ model, prompt, output: `Video generation process failed: ${errorMessage}`, tokenCount: 0, status: 'Error', error: errorMessage });
        throw error;
    }
};


/**
 * Generates text content from a prompt and one or more images.
 * @param {string} prompt - The text prompt.
 * @param {MultimodalContent[]} images - An array of image objects.
 * @returns {Promise<string>} The text response from the model.
 */
export const generateMultimodalContent = async (prompt: string, images: MultimodalContent[]): Promise<string> => {
    const model = MODELS.text;
    const textPart = { text: prompt };
    const imageParts = images.map(image => ({
        inlineData: {
            mimeType: image.mimeType,
            data: image.base64,
        },
    }));
    
    console.debug(`[Multimodal Prompt Sent]\n---\n${prompt}\n---`);

    const apiCall = async () => {
        const ai = getAiInstance();
        return await ai.models.generateContent({
            model,
            contents: { parts: [...imageParts, textPart] },
            config: {
                thinkingConfig: { thinkingBudget: 0 },
            }
        });
    };
    
    const logPrompt = `${prompt} [${images.length} image(s)]`;

    try {
        const response = await withRetry(apiCall, (attempt, error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Attempt ${attempt} for generateMultimodalContent failed: ${errorMessage}. Retrying...`);
            addLogEntry({
                model,
                prompt: `${logPrompt} (Retry ${attempt}/${MAX_RETRIES})`,
                output: `Attempt ${attempt} failed. Retrying...`,
                tokenCount: 0,
                status: 'Error',
                error: `Retry ${attempt}: ${errorMessage}`
            });
        });

        const textOutput = response.text ?? '';
        addLogEntry({
            model,
            prompt: logPrompt,
            output: textOutput,
            tokenCount: response.usageMetadata?.totalTokenCount ?? 0,
            status: 'Success'
        });
        triggerUserWebhook({ type: 'text', prompt, result: textOutput });
        return textOutput;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLogEntry({ model, prompt: logPrompt, output: `Error after ${MAX_RETRIES} attempts: ${errorMessage}`, tokenCount: 0, status: 'Error', error: errorMessage });
        throw error;
    }
};

/**
 * Generates text content from a text-only prompt.
 * @param {string} prompt - The text prompt.
 * @returns {Promise<string>} The text response from the model.
 */
export const generateText = async (prompt: string): Promise<string> => {
    const model = MODELS.text;
    console.debug(`[Text Prompt Sent]\n---\n${prompt}\n---`);
    
    const apiCall = async () => {
        const ai = getAiInstance();
        return await ai.models.generateContent({
            model,
            contents: { parts: [{ text: prompt }] },
            config: {
                thinkingConfig: { thinkingBudget: 0 },
            }
        });
    };

    try {
        const response = await withRetry(apiCall, (attempt, error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Attempt ${attempt} for generateText failed: ${errorMessage}. Retrying...`);
            addLogEntry({
                model,
                prompt: `${prompt.substring(0, 100)}... (Retry ${attempt}/${MAX_RETRIES})`,
                output: `Attempt ${attempt} failed. Retrying...`,
                tokenCount: 0,
                status: 'Error',
                error: `Retry ${attempt}: ${errorMessage}`
            });
        });

        const textOutput = response.text ?? '';
        addLogEntry({
            model,
            prompt,
            output: textOutput,
            tokenCount: response.usageMetadata?.totalTokenCount ?? 0,
            status: 'Success'
        });
        triggerUserWebhook({ type: 'text', prompt, result: textOutput });
        return textOutput;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLogEntry({ model, prompt, output: `Error after ${MAX_RETRIES} attempts: ${errorMessage}`, tokenCount: 0, status: 'Error', error: errorMessage });
        throw error;
    }
};

/**
 * Generates text content with Google Search grounding for up-to-date information.
 * @param {string} prompt - The text prompt.
 * @returns {Promise<GenerateContentResponse>} The full response object from the model, including grounding metadata.
 */
export const generateContentWithGoogleSearch = async (prompt: string): Promise<GenerateContentResponse> => {
    const model = MODELS.text;
    console.debug(`[Google Search Prompt Sent]\n---\n${prompt}\n---`);
    
    const apiCall = async () => {
        const ai = getAiInstance();
        return await ai.models.generateContent({
            model,
            contents: { parts: [{ text: prompt }] },
            config: {
                tools: [{ googleSearch: {} }],
                thinkingConfig: { thinkingBudget: 0 },
            },
        });
    };

    try {
        const response = await withRetry(apiCall, (attempt, error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Attempt ${attempt} for generateContentWithGoogleSearch failed: ${errorMessage}. Retrying...`);
            addLogEntry({
                model: `${model} (Search)`,
                prompt: `${prompt} (Retry ${attempt}/${MAX_RETRIES})`,
                output: `Attempt ${attempt} failed. Retrying...`,
                tokenCount: 0,
                status: 'Error',
                error: `Retry ${attempt}: ${errorMessage}`
            });
        });
        
        const textOutput = response.text ?? '';
        addLogEntry({
            model,
            prompt,
            output: textOutput,
            tokenCount: response.usageMetadata?.totalTokenCount ?? 0,
            status: 'Success'
        });
        triggerUserWebhook({ type: 'text', prompt, result: textOutput });
        return response; // Return the whole object
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLogEntry({ model, prompt, output: `Error after ${MAX_RETRIES} attempts: ${errorMessage}`, tokenCount: 0, status: 'Error', error: errorMessage });
        throw error;
    }
};

/**
 * Generates a voice-over from a text script using Google Cloud's Text-to-Speech API.
 * @param {string} script - The text to convert to speech.
 * @param {string} actorId - The ID of the voice actor (e.g., 'en-US-Standard-A').
 * @param {string} language - The language to speak in.
 * @param {string} mood - The desired mood for the voice.
 * @returns {Promise<Blob | null>} A blob containing the generated audio file, or null on error.
 */
export const generateVoiceOver = async (
    script: string,
    actorId: string,
    language: string,
    mood: string,
    generationMode: 'speak' | 'sing',
    musicStyle?: string
): Promise<Blob | null> => {
    const model = 'gemini-2.5-flash-preview-tts';
    const webhookPrompt = generationMode === 'sing'
        ? `Sing: ${musicStyle}, Voice: ${actorId}, Lang: ${language}, Script: ${script.substring(0, 100)}...`
        : `Voice: ${actorId}, Lang: ${language}, Mood: ${mood}, Script: ${script.substring(0, 100)}...`;
    
    let fullPrompt = '';

    if (generationMode === 'sing') {
        let singInstruction = `Sing the following lyrics in a ${musicStyle || 'pop'} music style`;
        if (language === 'Bahasa Melayu') {
            singInstruction = `Nyanyikan lirik berikut dalam gaya muzik ${musicStyle || 'pop'} dalam Bahasa Melayu`;
        }
        fullPrompt = `${singInstruction}: "${script}"`;
    } else { // 'speak'
        const moodInstructionMap: { [key: string]: string } = {
            'Normal': '',
            'Ceria': 'Say cheerfully: ',
            'Semangat': 'Say with an energetic and enthusiastic tone: ',
            'Jualan': 'Say in a persuasive and compelling sales tone: ',
            'Sedih': 'Say in a sad and melancholic tone: ',
            'Berbisik': 'Say in a whispering tone: ',
            'Marah': 'Say in an angry tone: ',
            'Tenang': 'Say in a calm and soothing tone: ',
            'Rasmi': 'Say in a formal and professional tone: ',
            'Teruja': 'Say in an excited tone: ',
            'Penceritaan': 'Say in a storytelling tone: ',
            'Berwibawa': 'Say in an authoritative and firm tone: ',
            'Mesra': 'Say in a friendly and warm tone: '
        };
        
        const moodInstruction = moodInstructionMap[mood as keyof typeof moodInstructionMap] || '';
        
        let languageInstruction = '';
        if (language === 'Bahasa Melayu') {
            languageInstruction = 'Sebutkan yang berikut dalam Bahasa Melayu yang jelas: ';
        }
        
        fullPrompt = `${languageInstruction}${moodInstruction}${script}`;
    }
    
    console.debug(`[Voice Over Prompt Sent]\n---\n${fullPrompt}\n---`);

    const apiCall = async () => {
        const ai = getAiInstance();
        return await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: fullPrompt }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: actorId },
                    },
                },
            },
        });
    };
    
    try {
        const response = await withRetry(apiCall, (attempt, error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Attempt ${attempt} for generateVoiceOver failed: ${errorMessage}. Retrying...`);
            addLogEntry({
                model,
                prompt: `${webhookPrompt} (Retry ${attempt}/${MAX_RETRIES})`,
                output: `Attempt ${attempt} failed. Retrying...`,
                tokenCount: 0,
                status: 'Error',
                error: `Retry ${attempt}: ${errorMessage}`
            });
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (!base64Audio) {
            throw new Error("No audio data received from API.");
        }
        
        // The TTS API returns raw PCM data at 24kHz, 1 channel, 16-bit.
        const pcmData = decodeBase64(base64Audio);
        const wavBlob = createWavBlob(pcmData, 24000, 1, 16);

        addLogEntry({
            model,
            prompt: webhookPrompt,
            output: '1 audio file generated.',
            tokenCount: 0, // Not applicable
            status: 'Success',
            mediaOutput: wavBlob
        });
        
        triggerUserWebhook({ type: 'audio', prompt: webhookPrompt, result: wavBlob });
        return wavBlob;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLogEntry({
            model,
            prompt: webhookPrompt,
            output: `Error after ${MAX_RETRIES} attempts: ${errorMessage}`,
            tokenCount: 0,
            status: 'Error',
            error: errorMessage
        });
        throw error;
    }
};

/**
 * Runs a minimal, non-blocking health check on an API key for critical services.
 * @param {string} apiKeyToCheck - The API key to test.
 * @returns {Promise<{ image: boolean; veo3: boolean; }>} A promise that resolves to the status of image and VEO 3 models.
 */
export const runMinimalHealthCheck = async (apiKeyToCheck: string): Promise<{ image: boolean; veo3: boolean; }> => {
    if (!apiKeyToCheck) {
        return { image: false, veo3: false };
    }

    const ai = new GoogleGenAI({ apiKey: apiKeyToCheck });

    // A tiny, valid transparent PNG for image model checks
    const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const imageCheckPromise = ai.models.generateContent({
        model: MODELS.imageEdit,
        contents: { parts: [{ inlineData: { data: tinyPngBase64, mimeType: 'image/png' } }, { text: 'test' }] },
        config: { responseModalities: [Modality.TEXT] }, // Only need a successful call, not an image back.
    });

    const veo3CheckPromise = ai.models.generateVideos({ 
        model: 'veo-3.0-generate-001', 
        prompt: 'test', 
        config: { numberOfVideos: 1 } 
    });

    const [imageResult, veo3Result] = await Promise.allSettled([imageCheckPromise, veo3CheckPromise]);
    
    // Log failures for debugging without throwing
    if (imageResult.status === 'rejected') console.debug(`Minimal health check failed for image:`, (imageResult.reason as Error).message);
    if (veo3Result.status === 'rejected') console.debug(`Minimal health check failed for VEO 3:`, (veo3Result.reason as Error).message);

    const isImageOk = imageResult.status === 'fulfilled';
    // A fulfilled promise for generateVideos returns an Operation.
    // If the operation has an `error` property immediately, it's a failure.
    // This handles cases where the promise resolves but the operation is invalid from the start.
    const isVeo3Ok = veo3Result.status === 'fulfilled' && !(veo3Result.value as any).error;

    return {
        image: isImageOk,
        veo3: isVeo3Ok,
    };
};

/**
 * A lightweight check specifically for the image model, for auto-key-claiming.
 * @param {string} apiKeyToCheck - The API key to test.
 * @returns {Promise<boolean>} A promise that resolves to true if the image model is accessible.
 */
export const isImageModelHealthy = async (apiKeyToCheck: string): Promise<boolean> => {
    if (!apiKeyToCheck) return false;

    try {
        const ai = new GoogleGenAI({ apiKey: apiKeyToCheck });
        const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        
        await ai.models.generateContent({
            model: MODELS.imageEdit,
            contents: { parts: [{ inlineData: { data: tinyPngBase64, mimeType: 'image/png' } }, { text: 'test' }] },
            config: { responseModalities: [Modality.TEXT] },
        });
        
        return true;
    } catch (error) {
        console.debug(`Image model health check failed for key:`, (error as Error).message);
        return false;
    }
};



// --- ADMIN API HEALTH CHECK ---

export interface HealthCheckResult {
    service: string;
    model: string;
    status: 'operational' | 'error' | 'degraded';
    message: string;
    details?: string;
}

const getShortErrorMessage = (e: any): string => {
    let message = e.message || String(e);
    try {
        // If the message is a JSON string, parse it and get the core message.
        const errorObj = JSON.parse(message);
        if (errorObj?.error?.message) {
            message = errorObj.error.message;
        } else if (errorObj?.message) {
            message = errorObj.message;
        }
    } catch (parseError) {
        // Not a JSON string, proceed with the original message.
    }

    // Return the first line of the potentially cleaned message.
    const firstLine = message.split('\n')[0];
    if (firstLine.startsWith('[GoogleGenerativeAI Error]: ')) {
        return firstLine.replace('[GoogleGenerativeAI Error]: ', '');
    }
    
    return firstLine;
};

export const runApiHealthCheck = async (keys: { textKey?: string }): Promise<HealthCheckResult[]> => {
    console.log('--- Starting Full API Health Check ---');
    const { textKey } = keys;

    if (!textKey) {
        throw new Error("An API Key is required for a health check.");
    }

    const ai = new GoogleGenAI({ apiKey: textKey });
    const results: HealthCheckResult[] = [];

    // 1. Text Generation
    console.log('1. Checking Text Generation (Gemini)...');
    try {
        await ai.models.generateContent({ model: MODELS.text, contents: 'test', config: { maxOutputTokens: 2, thinkingConfig: { thinkingBudget: 1 } } });
        results.push({ service: 'Text Generation', model: MODELS.text, status: 'operational', message: 'OK' });
        console.log('   ✅ Text Generation OK');
    } catch (e: any) {
        results.push({ service: 'Text Generation', model: MODELS.text, status: 'error', message: getShortErrorMessage(e) });
        console.error('   ❌ Text Generation FAILED:', getShortErrorMessage(e));
    }
    
    // Get tokens for proxied services
    const getTokens = (): { token: string; createdAt: string }[] => {
        const tokensJSON = sessionStorage.getItem('veoAuthTokens');
        if (tokensJSON) {
            try {
                const parsed = JSON.parse(tokensJSON);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch (e) { console.error("Could not parse proxy tokens for health check", e); }
        }
        return [];
    };
    const proxyTokens = getTokens();
    const imagenModel = MODELS.imageGeneration;
    const videoModel = MODELS.videoGenerationDefault;

    // 2. Imagen Generation Check
    console.log('2. Checking Imagen Generation (Proxy)...');
    if (proxyTokens.length === 0) {
        results.push({ service: 'Imagen Generation', model: imagenModel, status: 'degraded', message: 'Health check skipped. Auth Token not found.' });
        console.warn('   ⚠️ Imagen check skipped: No Auth Token found.');
    } else {
        let success = false;
        let lastError: any = null;
        for (let i = 0; i < proxyTokens.length; i++) {
            console.log(`   - Testing with token #${i + 1}...`);
            try {
                await generateImageWithImagen({
                    prompt: 'test',
                    config: {
                        authToken: proxyTokens[i].token,
                        aspectRatio: '1:1',
                    }
                }, undefined, true);
                results.push({ 
                    service: 'Imagen Generation', 
                    model: imagenModel, 
                    status: 'operational', 
                    message: 'Initial request successful.',
                    details: `(Using token #${i + 1})`
                });
                console.log(`     ✅ Token #${i + 1} OK`);
                success = true;
                break;
            } catch (e) {
                lastError = e;
                console.error(`     ❌ Token #${i + 1} FAILED:`, getShortErrorMessage(e));
            }
        }
        if (!success) {
            results.push({ 
                service: 'Imagen Generation', 
                model: imagenModel, 
                status: 'error', 
                message: getShortErrorMessage(lastError),
                details: '(All available tokens failed)'
            });
        }
    }

    // 3. VEO 3.1 Generation
    console.log('3. Checking VEO 3.1 Generation (Proxy)...');
    if (proxyTokens.length === 0) {
        results.push({ service: 'VEO 3.1 Generation', model: videoModel, status: 'degraded', message: 'Health check skipped. Auth Token not found.' });
        console.warn('   ⚠️ VEO check skipped: No Auth Token not found.');
    } else {
        let success = false;
        let lastError: any = null;

        for (let i = 0; i < proxyTokens.length; i++) {
            const currentToken = proxyTokens[i].token;
            console.log(`   - Testing with token #${i + 1}...`);
            try {
                const { operations: initialOperations } = await generateVideoWithVeo3({
                    prompt: 'test',
                    config: {
                        authToken: currentToken,
                        aspectRatio: 'landscape',
                        useStandardModel: !videoModel.includes('fast'),
                    },
                }, undefined, true);

                if (!initialOperations || initialOperations.length === 0 || (initialOperations[0] as any).error) {
                    throw new Error((initialOperations[0] as any)?.error?.message || 'Initial request failed without specific error.');
                }
                
                results.push({ 
                    service: 'VEO 3.1 Generation', 
                    model: videoModel, 
                    status: 'operational', 
                    message: 'Initial request successful.',
                    details: `(Using token #${i + 1})`
                });
                console.log(`     ✅ Token #${i + 1} OK`);
                success = true;
                break;
            } catch (e: any) {
                lastError = e;
                console.error(`     ❌ Token #${i + 1} FAILED:`, getShortErrorMessage(e));
            }
        }

        if (!success) {
            results.push({ 
                service: 'VEO 3.1 Generation', 
                model: videoModel, 
                status: 'error', 
                message: getShortErrorMessage(lastError),
                details: '(All available tokens failed)'
            });
        }
    }
    console.log('--- Health Check Complete ---');
    return results;
};