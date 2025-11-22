import React, { useState, useRef, useEffect } from 'react';
import { DownloadIcon, SparklesIcon, AlertTriangleIcon, ImageIcon, RefreshCwIcon, CheckCircleIcon, TrashIcon, WandIcon } from '../Icons';
import Spinner from '../common/Spinner';
import ImageUpload from '../common/ImageUpload';
import { type User, type Language } from '../../types';
import CreativeDirectionPanel from '../common/CreativeDirectionPanel';
import { getInitialCreativeDirectionState, type CreativeDirectionState } from '../../services/creativeDirectionService';
import { addHistoryItem } from '../../services/historyService';
import { incrementImageUsage } from '../../services/userService';

// --- CONFIG ---
const SERVERS = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i + 1}`,
    name: `S${i + 1}`,
    url: `https://s${i + 1}.monoklix.com`
}));

// 6 Slots for results
const SLOTS = [0, 1, 2, 3, 4, 5];

interface UgcGenViewProps {
    currentUser: User;
    language: Language;
    onUserUpdate: (user: User) => void;
}

type SlotStatus = 'idle' | 'loading' | 'success' | 'failed';

interface SlotState {
    status: SlotStatus;
    serverName?: string;
    imageUrl?: string;
    error?: string;
    logs: string[];
}

const UgcGenView: React.FC<UgcGenViewProps> = ({ currentUser, language, onUserUpdate }) => {
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    
    const [referenceImages, setReferenceImages] = useState<({ base64: string, mimeType: string } | null)[]>([null, null]);
    const [uploadKeys, setUploadKeys] = useState([Date.now(), Date.now() + 1]);

    const [creativeState, setCreativeState] = useState<CreativeDirectionState>(getInitialCreativeDirectionState());
    const [isGenerating, setIsGenerating] = useState(false);

    const [slots, setSlots] = useState<SlotState[]>(Array(6).fill({ status: 'idle', logs: [] }));

    const updateSlot = (index: number, updates: Partial<SlotState>) => {
        setSlots(prev => {
            const newSlots = [...prev];
            newSlots[index] = { ...newSlots[index], ...updates };
            return newSlots;
        });
    };

    const addLog = (index: number, message: string) => {
        setSlots(prev => {
            const newSlots = [...prev];
            const timestamp = new Date().toLocaleTimeString();
            newSlots[index] = { 
                ...newSlots[index], 
                logs: [...newSlots[index].logs, `[${timestamp}] ${message}`] 
            };
            return newSlots;
        });
    };

    const handleImageUpdate = (index: number, data: { base64: string, mimeType: string } | null) => {
        setReferenceImages(prev => {
            const newImages = [...prev];
            newImages[index] = data;
            return newImages;
        });
    };

    const handleResetSlot = (index: number) => {
        updateSlot(index, { status: 'idle', imageUrl: undefined, error: undefined, logs: [] });
    };

    const getRandomServer = () => SERVERS[Math.floor(Math.random() * SERVERS.length)];

    const getRandomToken = () => {
        const userToken = currentUser.personalAuthToken;
        try {
            const tokensJSON = sessionStorage.getItem('veoAuthTokens');
            if (tokensJSON) {
                const tokens: { token: string }[] = JSON.parse(tokensJSON);
                if (tokens.length > 0) {
                    return tokens[Math.floor(Math.random() * tokens.length)].token;
                }
            }
        } catch (e) {
            console.error("Error reading tokens", e);
        }
        return userToken || ''; 
    };

    const constructFullPrompt = () => {
        const creativeParts = [];
        if (creativeState.vibe !== 'Random') creativeParts.push(`Vibe: ${creativeState.vibe}`);
        if (creativeState.style !== 'Random') creativeParts.push(`Style: ${creativeState.style}`);
        if (creativeState.lighting !== 'Random') creativeParts.push(`Lighting: ${creativeState.lighting}`);
        if (creativeState.camera !== 'Random') creativeParts.push(`Camera: ${creativeState.camera}`);
        if (creativeState.composition !== 'Random') creativeParts.push(`Composition: ${creativeState.composition}`);
        if (creativeState.lensType !== 'Random') creativeParts.push(`Lens: ${creativeState.lensType}`);
        if (creativeState.filmSim !== 'Random') creativeParts.push(`Film Sim: ${creativeState.filmSim}`);
        if (creativeState.effect !== 'None' && creativeState.effect !== 'Random') creativeParts.push(`Effect: ${creativeState.effect}`);
        
        let base = prompt;
        if (creativeParts.length > 0) {
            base += `\n\nCreative Direction: ${creativeParts.join(', ')}`;
        }
        if (negativePrompt) {
            base += `\n\nNegative Prompt: ${negativePrompt}`;
        }
        return base;
    };

    const generateSingleSlot = async (index: number) => {
        const server = getRandomServer();
        const token = getRandomToken();

        updateSlot(index, { status: 'loading', serverName: server.name, error: undefined, imageUrl: undefined, logs: [] });
        addLog(index, `Connecting to Server ${server.name}...`);

        if (!token) {
            updateSlot(index, { status: 'failed', error: 'No Auth Token Available' });
            addLog(index, "Error: No Auth Token found.");
            return;
        }

        const fullPrompt = constructFullPrompt();
        const seed = Math.floor(Math.random() * 2147483647);
        addLog(index, `Seed: ${seed}`);

        try {
            let resultBase64: string | null = null;
            
            const validImages = referenceImages.filter((img): img is { base64: string, mimeType: string } => img !== null);

            if (validImages.length > 0) {
                const mediaIds: string[] = [];

                for (let i = 0; i < validImages.length; i++) {
                    addLog(index, `Uploading reference image ${i + 1}...`);
                    const img = validImages[i];
                    const uploadRes = await fetch(`${server.url}/api/imagen/upload`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ imageInput: { rawImageBytes: img.base64, mimeType: img.mimeType } })
                    });
                    const uploadData = await uploadRes.json();
                    if (!uploadRes.ok) throw new Error(uploadData.error?.message || 'Upload failed');
                    
                    const mediaId = uploadData.result?.data?.json?.result?.uploadMediaGenerationId || uploadData.mediaGenerationId?.mediaGenerationId || uploadData.mediaId;
                    mediaIds.push(mediaId);
                }

                addLog(index, "Generating image (Recipe mode)...");
                const recipeMediaInputs = mediaIds.map(id => ({ 
                    mediaInput: { mediaCategory: 'MEDIA_CATEGORY_SUBJECT', mediaGenerationId: id }, 
                    caption: 'reference' 
                }));

                const genRes = await fetch(`${server.url}/api/imagen/run-recipe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        userInstruction: fullPrompt,
                        seed: seed,
                        imageModelSettings: { imageModel: 'R2I', aspectRatio: aspectRatio === '1:1' ? 'IMAGE_ASPECT_RATIO_SQUARE' : (aspectRatio === '9:16' ? 'IMAGE_ASPECT_RATIO_PORTRAIT' : 'IMAGE_ASPECT_RATIO_LANDSCAPE') },
                        recipeMediaInputs: recipeMediaInputs
                    })
                });
                const genData = await genRes.json();
                if (!genRes.ok) throw new Error(genData.error?.message || 'Generation failed');
                resultBase64 = genData.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;

            } else {
                addLog(index, "Generating image (Text-to-Image)...");
                const payload = {
                    prompt: fullPrompt,
                    seed: seed,
                    imageModelSettings: { 
                        imageModel: 'IMAGEN_3_5', 
                        aspectRatio: aspectRatio === '1:1' ? 'IMAGE_ASPECT_RATIO_SQUARE' : (aspectRatio === '9:16' ? 'IMAGE_ASPECT_RATIO_PORTRAIT' : 'IMAGE_ASPECT_RATIO_LANDSCAPE')
                    } 
                };
                
                const res = await fetch(`${server.url}/api/imagen/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error?.message || 'Generation failed');
                resultBase64 = data.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;
            }

            if (resultBase64) {
                addLog(index, "Success! Image received.");
                updateSlot(index, { status: 'success', imageUrl: resultBase64 });
                
                addHistoryItem({
                    type: 'Image',
                    prompt: `UGC Batch: ${prompt.substring(0, 50)}...`,
                    result: resultBase64
                });
                incrementImageUsage(currentUser).then(r => { if(r.success && r.user) onUserUpdate(r.user); });
            } else {
                throw new Error('No image returned');
            }

        } catch (e: any) {
            addLog(index, `Error: ${e.message}`);
            updateSlot(index, { status: 'failed', error: e.message });
        }
    };

    const handleGenerateBatch = async () => {
        const hasRef = referenceImages.some(img => img !== null);
        if (!prompt.trim() && !hasRef) return;
        
        setIsGenerating(true);
        
        setSlots(prev => prev.map(s => ({ ...s, status: 'loading', logs: ['Wait for start...'] })));

        const promises = SLOTS.map((index) => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    generateSingleSlot(index).then(resolve);
                }, index * 500);
            });
        });

        await Promise.all(promises);
        setIsGenerating(false);
    };

    const downloadImage = (base64: string, id: number) => {
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${base64}`;
        link.download = `ugc-batch-${id}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold flex items-center gap-2 text-neutral-900 dark:text-white">
                    <SparklesIcon className="w-8 h-8 text-primary-500" />
                    UGC Batch Generator
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400">Generate 6 variations simultaneously using distributed server power.</p>
            </div>

            {/* Control Panel - REFINED */}
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-800">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* LEFT: Input Card */}
                    <div className="lg:col-span-1 flex flex-col h-full">
                        <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 flex flex-col gap-5 h-full shadow-inner">
                            
                            {/* Reference Images - FIXED: Removed extra border wrapper */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-sm font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
                                        <ImageIcon className="w-4 h-4"/> Reference Images
                                    </label>
                                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold bg-white dark:bg-neutral-800 px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700">Optional</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="relative">
                                        <ImageUpload 
                                            id="ugc-upload-1" 
                                            key={uploadKeys[0]}
                                            onImageUpload={(base64, mimeType) => handleImageUpdate(0, { base64, mimeType })}
                                            onRemove={() => handleImageUpdate(0, null)}
                                            language={language}
                                            title="Upload Ref 1"
                                        />
                                        <div className="absolute top-2 left-2 bg-neutral-900/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-md pointer-events-none backdrop-blur-sm border border-white/10">
                                            Slot 1
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <ImageUpload 
                                            id="ugc-upload-2" 
                                            key={uploadKeys[1]}
                                            onImageUpload={(base64, mimeType) => handleImageUpdate(1, { base64, mimeType })}
                                            onRemove={() => handleImageUpdate(1, null)}
                                            language={language}
                                            title="Upload Ref 2"
                                        />
                                        <div className="absolute top-2 left-2 bg-neutral-900/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-md pointer-events-none backdrop-blur-sm border border-white/10">
                                            Slot 2
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Prompt Input */}
                            <div className="flex-1 flex flex-col">
                                <label className="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-3 flex items-center gap-2">
                                    <WandIcon className="w-4 h-4"/> Magic Prompt
                                </label>
                                <div className="relative flex-1">
                                    <textarea 
                                        value={prompt} 
                                        onChange={e => setPrompt(e.target.value)} 
                                        className="w-full h-full min-h-[140px] p-4 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none text-sm leading-relaxed shadow-sm transition-all"
                                        placeholder="Describe the image you want to generate in detail..."
                                    />
                                    <div className="absolute bottom-3 right-3 pointer-events-none">
                                        <SparklesIcon className="w-5 h-5 text-neutral-300 dark:text-neutral-600" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* MIDDLE & RIGHT: Settings */}
                    <div className="lg:col-span-2 flex flex-col h-full">
                        <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 mb-6">
                            <h3 className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-4">Control Center</h3>
                            <CreativeDirectionPanel
                                state={creativeState}
                                setState={setCreativeState}
                                language={language}
                                showPose={true}
                                showEffect={true}
                            />
                            
                            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800 grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold mb-2">Aspect Ratio</label>
                                    <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none shadow-sm">
                                        <option value="1:1">Square (1:1)</option>
                                        <option value="9:16">Portrait (9:16)</option>
                                        <option value="16:9">Landscape (16:9)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-2">Negative Prompt</label>
                                    <input 
                                        type="text"
                                        value={negativePrompt} 
                                        onChange={e => setNegativePrompt(e.target.value)} 
                                        className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none shadow-sm"
                                        placeholder="blurry, low quality, watermark"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto">
                            <button 
                                onClick={handleGenerateBatch} 
                                disabled={isGenerating || (!prompt.trim() && !referenceImages.some(i => i !== null))}
                                className="w-full bg-gradient-to-r from-purple-600 via-primary-600 to-pink-600 hover:from-purple-700 hover:via-primary-700 hover:to-pink-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg"
                            >
                                {isGenerating ? <Spinner /> : <SparklesIcon className="w-6 h-6" />}
                                Generate 6 Variations
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Results Grid */}
            <div className="flex-1 overflow-y-auto pb-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {slots.map((slot, index) => (
                        <div key={index} className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden flex flex-col h-auto group hover:shadow-md transition-shadow">
                            
                            {/* Header */}
                            <div className="p-2 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50">
                                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wide">Slot {index + 1}</span>
                                {slot.serverName && <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-mono border border-blue-200 dark:border-blue-800">{slot.serverName}</span>}
                            </div>

                            {/* Content Area (Image) */}
                            <div className="relative w-full aspect-square bg-neutral-100 dark:bg-neutral-950 flex items-center justify-center overflow-hidden">
                                {slot.status === 'idle' && (
                                    <div className="text-neutral-400 flex flex-col items-center">
                                        <div className="p-4 bg-neutral-200 dark:bg-neutral-800 rounded-full mb-3 opacity-50">
                                            <ImageIcon className="w-8 h-8"/>
                                        </div>
                                        <span className="text-xs font-medium uppercase tracking-wide opacity-70">Ready</span>
                                    </div>
                                )}
                                {slot.status === 'loading' && (
                                    <div className="text-center w-full px-4">
                                        <Spinner />
                                        <p className="text-xs mt-3 text-neutral-500 animate-pulse font-medium">Processing...</p>
                                        <div className="mt-2 h-1 w-20 bg-neutral-200 dark:bg-neutral-800 rounded-full mx-auto overflow-hidden">
                                            <div className="h-full bg-primary-500 animate-progress w-full origin-left"></div>
                                        </div>
                                    </div>
                                )}
                                {slot.status === 'failed' && (
                                    <div className="text-center p-4 w-full">
                                        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <AlertTriangleIcon className="w-6 h-6 text-red-500" />
                                        </div>
                                        <p className="text-xs text-red-500 line-clamp-3 mb-2 font-medium">{slot.error}</p>
                                    </div>
                                )}
                                {slot.status === 'success' && slot.imageUrl && (
                                    <>
                                        <img src={`data:image/png;base64,${slot.imageUrl}`} alt={`Result ${index}`} className="w-full h-full object-cover" />
                                        {/* Overlay */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                                            <button 
                                                onClick={() => downloadImage(slot.imageUrl!, index)}
                                                className="p-3 bg-white text-black rounded-full hover:bg-neutral-200 transition-transform hover:scale-110 shadow-lg"
                                                title="Download"
                                            >
                                                <DownloadIcon className="w-6 h-6" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Log Console (Black Box) */}
                            <div className="h-24 bg-neutral-950 text-green-400 p-3 font-mono text-[10px] overflow-y-auto border-t border-neutral-200 dark:border-neutral-800 shadow-inner">
                                {slot.logs.length === 0 ? (
                                    <span className="opacity-30 italic text-neutral-500">Waiting for logs...</span> 
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {slot.logs.map((log, i) => (
                                            <div key={i} className="border-l-2 border-green-900 pl-2">{log}</div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex border-t border-neutral-200 dark:border-neutral-800 divide-x divide-neutral-200 dark:divide-neutral-800">
                                <button 
                                    onClick={() => handleResetSlot(index)} 
                                    className="flex-1 py-3 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors uppercase tracking-wider"
                                >
                                    Reset
                                </button>
                                <button 
                                    onClick={() => generateSingleSlot(index)}
                                    disabled={isGenerating} 
                                    className="flex-1 py-3 text-xs font-bold text-primary-600 dark:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50 uppercase tracking-wider"
                                >
                                    Re-create
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default UgcGenView;