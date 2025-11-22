import { supabase } from './supabaseClient';
import { type HistoryItem, type User, type ErrorWebhookPayload } from '../types';

// Webhook URL for error notifications.
// PASTE YOUR ERROR WEBHOOK URL HERE. Leave it empty to disable.
const ERROR_WEBHOOK_URL = 'https://n8n.1za7.com/webhook/trigger-error-log';

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                // result is "data:mime/type;base64,the_base_64_string"
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            } else {
                reject(new Error("Failed to read blob as base64 string."));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export type WebhookPayload = {
    type: 'text' | 'image' | 'video' | 'audio';
    prompt: string;
    result: string; // Base64 for media, text for text
    mimeType?: string;
    timestamp: number;
    userId: string;
};

const getCurrentUserFromSession = (): User | null => {
    try {
        const savedUserJson = localStorage.getItem('currentUser');
        if (savedUserJson) {
            const user = JSON.parse(savedUserJson) as User;
            if (user && user.id) {
                return user;
            }
        }
    } catch (error) {
        console.error("Failed to parse user from localStorage for webhook.", error);
    }
    return null;
}

export const triggerUserWebhook = async (
    data: Omit<WebhookPayload, 'timestamp' | 'userId' | 'result' | 'mimeType'> & { result: string | Blob, mimeType?: string }
) => {
    const user = getCurrentUserFromSession();
    if (!user) {
        console.error("User not authenticated, cannot trigger webhook.");
        return;
    }

    const { data: profile, error } = await supabase
        .from('users')
        .select('webhook_url')
        .eq('id', user.id)
        .single();
    
    if (error || !profile || !profile.webhook_url) {
        // No webhook configured, fail silently
        return;
    }

    const webhookUrl = profile.webhook_url;
    let resultData: string;
    let finalMimeType: string | undefined = data.mimeType;

    if (data.result instanceof Blob) {
        resultData = await blobToBase64(data.result);
        finalMimeType = data.result.type;
    } else {
        resultData = data.result;
        if (data.type === 'text' && !finalMimeType) finalMimeType = 'text/plain';
    }

    const payload: WebhookPayload = {
        type: data.type,
        prompt: data.prompt,
        result: resultData,
        mimeType: finalMimeType,
        timestamp: Date.now(),
        userId: user.id,
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            mode: 'no-cors' 
        });
    } catch (e) {
        console.error('Failed to trigger user webhook:', e);
    }
};

// FIX: Add missing triggerErrorWebhook function.
export const triggerErrorWebhook = (error: unknown) => {
    if (!ERROR_WEBHOOK_URL) {
        return; // Disabled
    }

    const user = getCurrentUserFromSession();

    let errorMessage: string;
    let errorObject: any;

    if (error instanceof Error) {
        errorMessage = error.message;
        errorObject = { name: error.name, message: error.message, stack: error.stack };
    } else {
        try {
            errorMessage = JSON.stringify(error);
            errorObject = error;
        } catch {
            errorMessage = String(error);
            errorObject = { info: 'Unserializable error object' };
        }
    }

    const payload: ErrorWebhookPayload = {
        errorMessage,
        errorObject,
        timestamp: Date.now(),
        userId: user?.id || 'N/A',
        username: user?.username || 'N/A',
        email: user?.email || 'N/A',
    };
    
    // This is a fire-and-forget call. We don't want to block the user.
    // We also don't want this logging to throw another error.
    fetch(ERROR_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'no-cors'
    }).catch(e => {
        console.error('CRITICAL: Failed to send error to webhook:', e);
    });
};

// FIX: Add missing sendTestUserWebhook function.
export const sendTestUserWebhook = async (): Promise<{ success: boolean; message: string }> => {
    const user = getCurrentUserFromSession();
    if (!user) {
        return { success: false, message: "webhookNotAuth" };
    }

    const { data: profile, error } = await supabase
        .from('users')
        .select('webhook_url')
        .eq('id', user.id)
        .single();
    
    if (error || !profile || !profile.webhook_url) {
        return { success: false, message: "webhookNotConfigured" };
    }

    const webhookUrl = profile.webhook_url;

    const testPayload = {
        type: 'test',
        message: 'This is a test webhook from MONOklix.com',
        timestamp: Date.now(),
        userId: user.id,
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload),
            mode: 'no-cors'
        });
        return { success: true, message: "webhookTestSuccess" };
    } catch (e) {
        console.error('Failed to trigger test user webhook:', e);
        const errorMessage = e instanceof Error ? e.message : 'Unknown network error.';
        return { success: false, message: `webhookTestFail ${errorMessage}` };
    }
};


// FIX: Add missing sendSocialPostToWebhook function.
export const sendSocialPostToWebhook = async (
    caption: string,
    hashtags: string,
    cta: string,
    link: string,
    scheduleDate: string,
    mediaItems: HistoryItem[]
): Promise<{ success: boolean; message: string }> => {
    const user = getCurrentUserFromSession();
    if (!user?.id) {
        return { success: false, message: "You are not logged in." };
    }

    if (!user.webhookUrl) {
        return { success: false, message: "No webhook URL is configured for your account." };
    }

    const mediaPayload = [];
    for (const item of mediaItems) {
        let base64Data: string;
        let mimeType: string;
        let filename: string;

        if (item.result instanceof Blob) { // This handles File objects too
            base64Data = await blobToBase64(item.result);
            mimeType = item.result.type;
            const extension = mimeType.split('/')[1] || 'bin';
            filename = `${item.type.toLowerCase()}-${item.id}.${extension}`;
        } else if (typeof item.result === 'string' && (item.type === 'Image' || item.type === 'Canvas')) {
            base64Data = item.result;
            mimeType = 'image/png';
            filename = `image-${item.id}.png`;
        } else {
            console.warn(`Unsupported media type in social post webhook: ${item.type}`);
            continue; // Skip unsupported types
        }
        
        mediaPayload.push({
            filename,
            mime_type: mimeType,
            data: base64Data
        });
    }

    const payload = {
        caption,
        hashtags,
        cta,
        link,
        scheduleDate,
        media: mediaPayload
    };

    try {
        await fetch(user.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            mode: 'no-cors'
        });
        return { success: true, message: "Post sent to webhook!" };
    } catch (e) {
        console.error('Failed to send social post to webhook:', e);
        const errorMessage = e instanceof Error ? e.message : 'Unknown network error.';
        return { success: false, message: `Failed to send: ${errorMessage}` };
    }
};