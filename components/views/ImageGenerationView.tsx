import React, { useState, useCallback, useRef, useEffect } from 'react';
import { addHistoryItem } from '../../services/historyService';
import Spinner from '../common/Spinner';
import { UploadIcon, TrashIcon, DownloadIcon, VideoIcon, StarIcon, WandIcon, AlertTriangleIcon, RefreshCwIcon } from '../Icons';
import { type MultimodalContent } from '../../services/geminiService';
import TwoColumnLayout from '../common/TwoColumnLayout';
import { getImageEditingPrompt } from '../../services/promptManager';
import { handleApiError } from '../../services/errorHandler';
import { generateImageWithImagen, editOrComposeWithImagen } from '../../services/imagenV3Service';
import { incrementImageUsage } from '../../services/userService';
// FIX: Add missing Language import.
import { type User, type Language } from '../../types';
import CreativeDirectionPanel from '../common/CreativeDirectionPanel';
import { getInitialCreativeDirectionState, type CreativeDirectionState } from '../../services/creativeDirectionService';

interface ImageData extends MultimodalContent {
  id: string;
  previewUrl: string;
}

type ImageSlot = string | { error: string } | null;

const downloadImage = (base64Image: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${base64Image}`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

interface VideoGenPreset {
  prompt: string;
  image: { base64: string; mimeType: string; };
}

interface ImageEditPreset {
  base64: string;
  mimeType: string;
}

interface ImageGenerationViewProps {
  onCreateVideo: (preset: VideoGenPreset) => void;
  onReEdit: (preset: ImageEditPreset) => void;
  imageToReEdit: ImageEditPreset | null;
  clearReEdit: () => void;
  presetPrompt: string | null;
  clearPresetPrompt: () => void;
  currentUser: User;
  onUserUpdate: (user: User) => void;
  // FIX: Add language to props.
  language: Language;
}

const SESSION_KEY = 'imageGenerationState';

const ImageGenerationView: React.FC<ImageGenerationViewProps> = ({ onCreateVideo, onReEdit, imageToReEdit, clearReEdit, presetPrompt, clearPresetPrompt, currentUser, onUserUpdate, language }) => {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<ImageSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ImageData[]>([]);
  const [numberOfImages, setNumberOfImages] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);

  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9' | '3:4' | '4:3'>('1:1');
  const [creativeState, setCreativeState] = useState<CreativeDirectionState>(getInitialCreativeDirectionState());

  const isEditing = referenceImages.length > 0;

  useEffect(() => {
    try {
      const savedState = sessionStorage.getItem(SESSION_KEY);
      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.prompt) setPrompt(state.prompt);
        if (state.numberOfImages) setNumberOfImages(state.numberOfImages);
        if (state.selectedImageIndex) setSelectedImageIndex(state.selectedImageIndex);
        if (state.negativePrompt) setNegativePrompt(state.negativePrompt);
        if (state.aspectRatio) setAspectRatio(state.aspectRatio);
        if (state.creativeState) setCreativeState(state.creativeState);
      }
    } catch (e) { console.error("Failed to load state from session storage", e); }
  }, []);

  useEffect(() => {
    try {
      const stateToSave = { prompt, numberOfImages, selectedImageIndex, negativePrompt, aspectRatio, creativeState };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateToSave));
    } catch (e) { console.error("Failed to save state to session storage", e); }
  }, [prompt, numberOfImages, selectedImageIndex, negativePrompt, aspectRatio, creativeState]);

  useEffect(() => {
    if (imageToReEdit) {
      const newImage: ImageData = {
        id: `re-edit-${Date.now()}`,
        previewUrl: `data:${imageToReEdit.mimeType};base64,${imageToReEdit.base64}`,
        base64: imageToReEdit.base64,
        mimeType: imageToReEdit.mimeType,
      };
      setReferenceImages([newImage]);
      setImages([]);
      setPrompt('');
      clearReEdit();
    }
  }, [imageToReEdit, clearReEdit]);

  useEffect(() => {
    if (presetPrompt) {
      setPrompt(presetPrompt);
      window.scrollTo(0, 0);
      clearPresetPrompt();
    }
  }, [presetPrompt, clearPresetPrompt]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    const filesToProcess = Array.from(files).slice(0, 5 - referenceImages.length);
    
    // FIX: Explicitly type `file` as `File` to resolve TS error where it was inferred as `unknown`.
    const validFiles = filesToProcess.filter((file: File) => {
      if (!acceptedTypes.includes(file.type)) {
        alert(`Unsupported file type: ${file.name}. Please upload a PNG or JPG file.`);
        return false;
      }
      return true;
    });

    validFiles.forEach((file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                const base64String = reader.result.split(',')[1];
                const newImage: ImageData = {
                    id: `${file.name}-${Date.now()}`,
                    previewUrl: reader.result as string,
                    base64: base64String,
                    mimeType: file.type,
                };
                setReferenceImages(prevImages => [...prevImages, newImage]);
                setImages([]);
            }
        };
        reader.readAsDataURL(file);
    });

    if(event.target) {
        event.target.value = '';
    }
  };

  const removeImage = (id: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== id));
  };
  
  const generateOneImage = useCallback(async (index: number, onStatusUpdate: (status: string) => void) => {
      setImages(prev => {
          const newImages = [...prev];
          newImages[index] = null; // Set to loading
          return newImages;
      });
      
      try {
          let resultImage: string | undefined;
          if (isEditing) {
              const creativeDetails = Object.entries(creativeState)
                .filter(([key, value]) => key !== 'creativityLevel' && value !== 'Random' && value !== 'None')
                .map(([, value]) => value)
                .join(', ');
              
              const promptWithCreativity = [prompt, creativeDetails].filter(Boolean).join(', ');

              const fullPrompt = negativePrompt ? `${promptWithCreativity}, negative prompt: ${negativePrompt}` : promptWithCreativity;
              const editingPrompt = getImageEditingPrompt(fullPrompt);

              const result = await editOrComposeWithImagen({
                  prompt: editingPrompt,
                  images: referenceImages.map(img => ({ ...img, category: 'MEDIA_CATEGORY_SUBJECT', caption: 'image to edit' })),
                  config: { aspectRatio }
              }, onStatusUpdate);
              resultImage = result.imagePanels[0]?.generatedImages[0]?.encodedImage;
          } else {
              const creativeDetails = Object.entries(creativeState)
                .filter(([key, value]) => key !== 'creativityLevel' && value !== 'Random' && value !== 'None')
                .map(([, value]) => value)
                .join(', ');
              
              const fullPrompt = [prompt, creativeDetails].filter(Boolean).join(', ');

              const result = await generateImageWithImagen({
                  prompt: fullPrompt,
                  config: {
                      sampleCount: 1,
                      aspectRatio,
                      negativePrompt
                  }
              }, onStatusUpdate);
              resultImage = result.imagePanels[0]?.generatedImages[0]?.encodedImage;
          }

          if (!resultImage) {
              throw new Error("The AI did not return an image. Please try a different prompt or reference image.");
          }
          
          await addHistoryItem({
              type: 'Image',
              prompt: isEditing ? `Image Edit: ${prompt}` : `Image Generation: ${prompt}`,
              result: resultImage
          });

          // FIX: Pass the full currentUser object instead of just the ID, as required by the function signature.
          const updateResult = await incrementImageUsage(currentUser);
          if (updateResult.success && updateResult.user) {
              onUserUpdate(updateResult.user);
          }

          setImages(prev => {
              const newImages = [...prev];
              newImages[index] = resultImage!;
              return newImages;
          });

      } catch (e) {
          const userFriendlyMessage = handleApiError(e);
          console.error(`Image Generation Failed (Slot ${index + 1}): ${userFriendlyMessage}`);
          setImages(prev => {
              const newImages = [...prev];
              newImages[index] = { error: userFriendlyMessage };
              return newImages;
          });
      }
  }, [prompt, referenceImages, isEditing, negativePrompt, aspectRatio, currentUser, onUserUpdate, creativeState]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && !isEditing) {
      setError("Please enter a prompt to describe the image you want to create.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStatusMessage('Preparing request...');
    setImages(Array(numberOfImages).fill(null));
    setSelectedImageIndex(0);

    for (let i = 0; i < numberOfImages; i++) {
        setProgress(i + 1);
        await generateOneImage(i, setStatusMessage);
    }

    setIsLoading(false);
    setProgress(0);
    setStatusMessage('');
  }, [numberOfImages, isEditing, prompt, generateOneImage]);
  
  const handleRetry = useCallback(async (index: number) => {
    await generateOneImage(index, setStatusMessage);
  }, [generateOneImage]);

  const handleLocalReEdit = (base64: string, mimeType: string) => {
      const newImage: ImageData = { id: `re-edit-${Date.now()}`, previewUrl: `data:${mimeType};base64,${base64}`, base64, mimeType };
      setReferenceImages([newImage]);
      setImages([]);
      setPrompt('');
  };

  const handleReset = useCallback(() => {
    setPrompt('');
    setImages([]);
    setError(null);
    setReferenceImages([]);
    setNumberOfImages(1);
    setSelectedImageIndex(0);
    if(fileInputRef.current) fileInputRef.current.value = '';
    setNegativePrompt('');
    setProgress(0);
    setStatusMessage('');
    setCreativeState(getInitialCreativeDirectionState());
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const leftPanel = (
    <>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{isEditing ? 'AI Image Editor' : 'AI Image Generation'}</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-1">{isEditing ? 'Edit your images with simple text commands.' : 'Create stunning images from text descriptions.'}</p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Reference / Source Images (up to 5)</label>
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 min-h-[116px]">
              <div className="flex items-center gap-3 flex-wrap">
                  {referenceImages.map(img => (
                      <div key={img.id} className="relative w-20 h-20">
                          <img src={img.previewUrl} alt="upload preview" className="w-full h-full object-cover rounded-md"/>
                          <button onClick={() => removeImage(img.id)} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 text-white hover:bg-red-600 transition-colors">
                              <TrashIcon className="w-3 h-3"/>
                          </button>
                      </div>
                  ))}
                  {referenceImages.length < 5 && (
                      <button onClick={() => fileInputRef.current?.click()} className="w-20 h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md flex flex-col items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          <UploadIcon className="w-6 h-6"/>
                          <span className="text-xs mt-1">Upload</span>
                      </button>
                  )}
                  <input type="file" accept="image/png, image/jpeg, image/jpg" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              </div>
               {isEditing ? (
                  <p className="text-xs text-primary-600 dark:text-primary-400 mt-2 p-2 bg-primary-500/10 rounded-md" dangerouslySetInnerHTML={{ __html: 'You are in <strong>Image Editing Mode</strong>. The prompt will be used as instructions to edit the source image.' }}/>
              ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Upload an image to edit it or combine it with your prompt.</p>
              )}
          </div>
      </div>

      <div>
        <label htmlFor="prompt" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Prompt</label>
        <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={isEditing ? 'e.g., Change the background to a beach...' : 'e.g., A cute cat wearing sunglasses...'} rows={4} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none transition" />
      </div>

      <CreativeDirectionPanel
        state={creativeState}
        setState={setCreativeState}
        language={language}
        showPose={false}
      />
      
      <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Generation Settings</label>
        <div className="grid grid-cols-2 gap-4">
            <select value={numberOfImages} onChange={(e) => setNumberOfImages(parseInt(e.target.value, 10))} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none">{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} Image{n > 1 ? 's' : ''}</option>)}</select>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as any)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none transition">
                <option value="1:1">Square (1:1)</option>
                <option value="9:16">Portrait (9:16)</option>
                <option value="16:9">Landscape (16:9)</option>
                <option value="3:4">Portrait (3:4)</option>
                <option value="4:3">Landscape (4:3)</option>
            </select>
        </div>
      </div>
      
      <div className="space-y-4 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-2">Advanced Settings</h2>
          <div>
            <label htmlFor="negative-prompt" className={`block text-sm font-medium mb-2 transition-colors text-gray-600 dark:text-gray-400`}>Negative Prompt (What to avoid)</label>
            <textarea id="negative-prompt" value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="e.g., text, watermarks, blurry, ugly" rows={2} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none transition" />
          </div>
      </div>

      <div className="pt-4 mt-auto">
        <div className="flex gap-4">
          <button onClick={handleGenerate} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isLoading ? <Spinner /> : isEditing ? 'Apply Edit' : 'Generate Image'}
          </button>
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="flex-shrink-0 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-3 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
          >
            Reset
          </button>
        </div>
        {error && !isLoading && <p className="text-red-500 dark:text-red-400 mt-2 text-center">{error}</p>}
      </div>
    </>
  );

  const ActionButtons: React.FC<{ imageBase64: string; mimeType: string }> = ({ imageBase64, mimeType }) => (
    <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
      <button onClick={() => handleLocalReEdit(imageBase64, mimeType)} title="Re-edit" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"><WandIcon className="w-4 h-4" /></button>
      <button onClick={() => onCreateVideo({ prompt, image: { base64: imageBase64, mimeType } })} title="Create Video" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"><VideoIcon className="w-4 h-4" /></button>
      <button onClick={() => downloadImage(imageBase64, `monoklix-image-${Date.now()}.png`)} title="Download" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"><DownloadIcon className="w-4 h-4" /></button>
    </div>
  );

  const rightPanel = (
    <>
      {images.length > 0 ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
            <div className="flex-1 flex items-center justify-center min-h-0 w-full relative group">
                {(() => {
                    const selectedImage = images[selectedImageIndex];
                    if (typeof selectedImage === 'string') {
                        return (
                            <>
                                <img src={`data:image/png;base64,${selectedImage}`} alt={`Generated image ${selectedImageIndex + 1}`} className="rounded-md max-h-full max-w-full object-contain" />
                                <ActionButtons imageBase64={selectedImage} mimeType="image/png" />
                            </>
                        );
                    } else if (selectedImage && typeof selectedImage === 'object') {
                        return (
                            <div className="text-center text-red-500 dark:text-red-400 p-4">
                                <AlertTriangleIcon className="w-12 h-12 mx-auto mb-4" />
                                <p className="font-semibold">Generation Failed</p>
                                <p className="text-sm mt-2 max-w-md mx-auto text-neutral-500 dark:text-neutral-400">Please check the console for details and try again.</p>
                                <button
                                    onClick={() => handleRetry(selectedImageIndex)}
                                    className="mt-6 flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors"
                                >
                                    <RefreshCwIcon className="w-4 h-4" />
                                    Try Again
                                </button>
                            </div>
                        );
                    }
                    return (
                        <div className="flex flex-col items-center justify-center h-full gap-2">
                            <Spinner />
                            <p className="text-sm text-neutral-500">{statusMessage}</p>
                            {isLoading && numberOfImages > 1 && (
                                <p className="text-sm text-neutral-500">
                                    {`Generating... (${progress}/${numberOfImages})`}
                                </p>
                            )}
                        </div>
                    );
                })()}
            </div>
             {images.length > 1 && (
                <div className="flex-shrink-0 w-full flex justify-center">
                <div className="flex gap-2 overflow-x-auto p-2">
                    {images.map((img, index) => (
                    <button key={index} onClick={() => setSelectedImageIndex(index)} className={`w-16 h-16 md:w-20 md:h-20 rounded-md overflow-hidden flex-shrink-0 transition-all duration-200 flex items-center justify-center bg-neutral-200 dark:bg-neutral-800 ${selectedImageIndex === index ? 'ring-4 ring-primary-500' : 'ring-2 ring-transparent hover:ring-primary-300'}`}>
                        {typeof img === 'string' ? (
                            <img src={`data:image/png;base64,${img}`} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                        ) : img && typeof img === 'object' ? (
                            <AlertTriangleIcon className="w-6 h-6 text-red-500" />
                        ) : (
                            <Spinner />
                        )}
                    </button>
                    ))}
                </div>
                </div>
            )}
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center h-full gap-2">
            <Spinner />
            <p className="text-sm text-neutral-500">{statusMessage}</p>
            <p className="text-sm text-neutral-500">
                {`Generating...${numberOfImages > 1 ? ` (1/${numberOfImages})` : ''}`}
            </p>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-center text-neutral-500 dark:text-neutral-600">
            <div><StarIcon className="w-16 h-16 mx-auto" /><p>Your generated images will appear here.</p></div>
        </div>
      )}
    </>
  );

  // FIX: Pass the 'language' prop to the TwoColumnLayout component.
  return <TwoColumnLayout leftPanel={leftPanel} rightPanel={rightPanel} language={language} />;
};

export default ImageGenerationView;
