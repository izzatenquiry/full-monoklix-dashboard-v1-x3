import { v4 as uuidv4 } from 'uuid';
import { executeProxiedRequest } from './apiClient';
import { generateVideoWithVeo3 } from './veo3Service';

// This map translates user-friendly aspect ratios to the API-specific enums.
const aspectRatioApiMap: { [key: string]: string } = {
    "1:1": "IMAGE_ASPECT_RATIO_SQUARE",
    "16:9": "IMAGE_ASPECT_RATIO_LANDSCAPE",
    "9:16": "IMAGE_ASPECT_RATIO_PORTRAIT",
    "4:3": "IMAGE_ASPECT_RATIO_FOUR_THREE",
    "3:4": "IMAGE_ASPECT_RATIO_THREE_FOUR"
};

export interface ImagenConfig {
  sampleCount?: number;
  aspectRatio?: '1:1' | '9:16' | '16:9' | '3:4' | '4:3';
  negativePrompt?: string;
  seed?: number;
  authToken?: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  config: ImagenConfig;
}

export interface RecipeMediaInput {
  caption: string;
  mediaInput: {
    mediaCategory: string; // e.g., MEDIA_CATEGORY_SUBJECT
    mediaGenerationId: string;
  };
}

// Updated to return the successful token
export const uploadImageForImagen = async (
    base64Image: string, 
    mimeType: string, 
    authToken?: string, 
    onStatusUpdate?: (status: string) => void
): Promise<{ mediaId: string; successfulToken: string }> => {
  console.log(`📤 [Imagen Service] Preparing to upload image for Imagen. MimeType: ${mimeType}`);
  const requestBody = {
    clientContext: { 
      sessionId: `;${Date.now()}` 
    },
    imageInput: {
      rawImageBytes: base64Image,
      mimeType: mimeType,
    }
  };

  // We use the robust executeProxiedRequest which handles token rotation
  const { data, successfulToken } = await executeProxiedRequest(
    '/upload',
    'imagen',
    requestBody, 
    'IMAGEN UPLOAD', 
    authToken, 
    onStatusUpdate
  );

  const mediaId = 
    data.result?.data?.json?.result?.uploadMediaGenerationId || 
    data.mediaGenerationId?.mediaGenerationId || 
    data.mediaId;

  if (!mediaId) {
    console.error("No mediaId in response:", JSON.stringify(data, null, 2));
    throw new Error('Upload succeeded but no mediaId was returned from the proxy.');
  }
  console.log(`📤 [Imagen Service] Image upload successful. Media ID: ${mediaId} using token ...${successfulToken.slice(-6)}`);
  
  return { mediaId, successfulToken };
};


export const generateImageWithImagen = async (request: ImageGenerationRequest, onStatusUpdate?: (status: string) => void, isHealthCheck = false) => {
  console.log(`🎨 [Imagen Service] Preparing generateImageWithImagen (T2I) request...`);
  const { prompt, config } = request;
  
  const fullPrompt = config.negativePrompt ? `${prompt}, negative prompt: ${config.negativePrompt}` : prompt;
  
  console.debug(`[Imagen T2I Prompt Sent]\n---\n${fullPrompt}\n---`);

  const requestBody = {
      clientContext: {
          tool: 'BACKBONE',
          sessionId: `;${Date.now()}`
      },
      imageModelSettings: {
          imageModel: 'IMAGEN_3_5',
          aspectRatio: aspectRatioApiMap[config.aspectRatio || '1:1'] || "IMAGE_ASPECT_RATIO_SQUARE",
      },
      prompt: fullPrompt,
      mediaCategory: 'MEDIA_CATEGORY_SCENE',
      seed: config.seed || Math.floor(Math.random() * 2147483647),
  };
  
  const logContext = isHealthCheck ? 'IMAGEN HEALTH CHECK' : 'IMAGEN GENERATE';
  console.log(`🎨 [Imagen Service] Sending T2I request to API client.`);
  
  const { data: result } = await executeProxiedRequest(
    '/generate',
    'imagen',
    requestBody,
    logContext,
    config.authToken,
    onStatusUpdate
  );

  console.log(`🎨 [Imagen Service] Received T2I result with ${result.imagePanels?.length || 0} panels.`);
  return result;
};

export const runImageRecipe = async (request: {
    userInstruction: string;
    recipeMediaInputs: RecipeMediaInput[];
    config: Omit<ImagenConfig, 'negativePrompt'>;
}, onStatusUpdate?: (status: string) => void) => {
    console.log(`✏️ [Imagen Service] Preparing runImageRecipe request with ${request.recipeMediaInputs.length} media inputs.`);
    const { userInstruction, recipeMediaInputs, config } = request;
    
    const requestBody = {
        clientContext: {
            tool: 'BACKBONE',
            sessionId: `;${Date.now()}`
        },
        seed: config.seed || Math.floor(Math.random() * 2147483647),
        imageModelSettings: {
            imageModel: 'R2I',
            aspectRatio: aspectRatioApiMap[config.aspectRatio || '1:1'] || "IMAGE_ASPECT_RATIO_SQUARE"
        },
        userInstruction,
        recipeMediaInputs
    };

    const { data: result } = await executeProxiedRequest(
      '/run-recipe',
      'imagen',
      requestBody,
      'IMAGEN RECIPE',
      config.authToken, // CRITICAL: This must be the SAME token used for upload
      onStatusUpdate
    );
    console.log(`✏️ [Imagen Service] Received recipe result with ${result.imagePanels?.length || 0} panels.`);
    return result;
};

export const editOrComposeWithImagen = async (request: {
    prompt: string,
    images: { base64: string, mimeType: string, category: string, caption: string }[],
    config: ImagenConfig
}, onStatusUpdate?: (status: string) => void) => {
    console.log(`🎨➡️✏️ [Imagen Service] Starting editOrComposeWithImagen flow with ${request.images.length} images.`);
    
    console.debug(`[Imagen Edit/Compose Prompt Sent]\n---\n${request.prompt}\n---`);

    // 1. Upload all images using the *same* logic.
    // Optimization: We try to upload the first image. If it rotates and picks a new token,
    // we MUST use that successful token for all subsequent uploads AND the final generation.
    
    const uploadedMedia = [];
    let consistentToken: string | undefined = request.config.authToken;

    for (let i = 0; i < request.images.length; i++) {
        const img = request.images[i];
        
        // Use consistentToken if we have one from a previous successful upload in this loop
        const { mediaId, successfulToken } = await uploadImageForImagen(
            img.base64, 
            img.mimeType, 
            consistentToken, 
            onStatusUpdate
        );
        
        // Lock in this token for the rest of the process
        if (!consistentToken) {
            consistentToken = successfulToken;
            console.log(`🔒 [Imagen Service] Locked token for session: ...${consistentToken.slice(-6)}`);
        } else if (consistentToken !== successfulToken) {
             // This theoretically shouldn't happen if we pass specificToken, 
             // but if it does, we have a problem because media IDs are split across tokens.
             console.warn(`⚠️ [Imagen Service] Token mismatch detected! Upload 1: ...${consistentToken.slice(-6)}, Upload ${i+1}: ...${successfulToken.slice(-6)}`);
             // We might need to re-upload previous ones or fail, but let's proceed for now.
             // In strict mode (specificToken passed), rotation shouldn't happen.
        }

        uploadedMedia.push({
            caption: img.caption,
            mediaInput: { mediaCategory: img.category, mediaGenerationId: mediaId }
        });
    }

    console.log(`🎨➡️✏️ [Imagen Service] All images uploaded. Sending composed recipe request using locked token.`);
    
    // 2. Run the recipe using the CONSISTENT token
    const result = await runImageRecipe({
        userInstruction: request.prompt,
        recipeMediaInputs: uploadedMedia,
        config: {
            ...request.config,
            authToken: consistentToken // Force use of the token that owns the media IDs
        }
    }, onStatusUpdate);
    
    return result;
};

export interface TokenTestResult {
    service: 'Imagen' | 'Veo';
    success: boolean;
    message: string;
}

export const runComprehensiveTokenTest = async (token: string): Promise<TokenTestResult[]> => {
    if (!token) {
        return [
            { service: 'Imagen', success: false, message: 'Token is empty.' },
            { service: 'Veo', success: false, message: 'Token is empty.' },
        ];
    }

    const results: TokenTestResult[] = [];

    // Test Imagen
    try {
        await generateImageWithImagen({
            prompt: 'test',
            config: {
                authToken: token,
                sampleCount: 1,
                aspectRatio: '1:1'
            }
        }, undefined, true);
        results.push({ service: 'Imagen', success: true, message: 'Operational' });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ service: 'Imagen', success: false, message });
    }
    
    // Test Veo
    try {
        await generateVideoWithVeo3({
            prompt: 'test',
            config: {
                authToken: token,
                aspectRatio: 'landscape',
                useStandardModel: false,
            },
        }, undefined, true);
        results.push({ service: 'Veo', success: true, message: 'Operational' });
    } catch (error) {
         const message = error instanceof Error ? error.message : String(error);
        results.push({ service: 'Veo', success: false, message });
    }
    
    return results;
};