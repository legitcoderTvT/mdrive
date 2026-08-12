require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { google } = require('googleapis');

// 1. Authenticate with Google Drive API
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// High-resolution fallback video icon
const FALLBACK_VIDEO_ICON = 'https://cdn-icons-png.flaticon.com/512/1179/1179069.png';

// 2. Define the Manifest (🚨 FIXED: Added 'meta' to resources)
const manifest = {
    id: 'com.mdrive.cloud',
    version: '1.3.0',
    name: 'M Drive',
    description: 'Stream directly from your Google Drive & Shared files',
    catalogs: [
        {
            type: 'other',
            id: 'gdrive_my_videos',
            name: 'M Drive - My Videos'
        },
        {
            type: 'other',
            id: 'gdrive_shared_videos',
            name: 'M Drive - Shared With Me'
        }
    ],
    resources: ['catalog', 'meta', 'stream'], // <-- Meta is now here!
    types: ['movie', 'series', 'other'],
    idPrefixes: ['gdrive:']
};

const builder = new addonBuilder(manifest);

// 3. Catalog Handler: The Menu of Videos
builder.defineCatalogHandler(async ({ type, id }) => {
    let query = "";

    if (id === 'gdrive_my_videos') {
        query = "mimeType contains 'video/' and trashed = false and 'me' in owners";
    } else if (id === 'gdrive_shared_videos') {
        query = "mimeType contains 'video/' and trashed = false and sharedWithMe = true";
    } else {
        return { metas: [] };
    }

    try {
        const res = await drive.files.list({
            q: query,
            fields: 'files(id, name, thumbnailLink)',
            pageSize: 1000
        });

        const metas = res.data.files.map(file => {
            let posterUrl = FALLBACK_VIDEO_ICON;
            if (file.thumbnailLink) {
                posterUrl = file.thumbnailLink.replace(/=s\d+/, '=s800');
            }

            return {
                id: `gdrive:${file.id}`,
                type: 'other',
                name: file.name,
                posterShape: 'poster',
                poster: posterUrl
            };
        });

        return { metas };
    } catch (error) {
        console.error("Drive Catalog Error:", error.message);
        return { metas: [] };
    }
});

// 4. Meta Handler: The Movie Details Page (🚨 NEW: Stremio needs this to open the video)
builder.defineMetaHandler(async ({ type, id }) => {
    if (id.startsWith('gdrive:')) {
        const fileId = id.split(':')[1];
        
        try {
            // Ask Google Drive for the specific file details
            const res = await drive.files.get({
                fileId: fileId,
                fields: 'id, name, thumbnailLink'
            });
            
            const file = res.data;
            let posterUrl = FALLBACK_VIDEO_ICON;
            if (file.thumbnailLink) {
                posterUrl = file.thumbnailLink.replace(/=s\d+/, '=s800'); // Upgrades to HD
            }

            return {
                meta: {
                    id: `gdrive:${file.id}`,
                    type: 'other',
                    name: file.name,
                    poster: posterUrl,
                    background: posterUrl,
                    description: "Streaming directly from your Google Drive."
                }
            };
        } catch (error) {
            console.error("Meta Error:", error.message);
            return { meta: {} };
        }
    }
    return { meta: {} };
});

// 5. Stream Handler: Direct Video Streaming
builder.defineStreamHandler(async ({ type, id }) => {
    if (id.startsWith('gdrive:')) {
        const fileId = id.split(':')[1];
        try {
            // Get fresh access token for playback
            const { token } = await oauth2Client.getAccessToken();
            const streamUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${token}`;

            return {
                streams: [
                    {
                        url: streamUrl,
                        name: "Google Drive",
                        description: "Direct Stream ⚡"
                    }
                ]
            };
        } catch (error) {
            console.error("Stream Error:", error.message);
            return { streams: [] };
        }
    }
    return { streams: [] };
});

// 6. Start Server
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log('M Drive Addon Server is running!');