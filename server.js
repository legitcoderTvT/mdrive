require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { google } = require('googleapis');

// 1. Authenticate with Google using your new Refresh Token
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// 2. Define what the Addon is and what it does (The Manifest)
const manifest = {
    id: 'com.mdrive.cloud',
    version: '1.0.0',
    name: 'M Drive',
    description: 'Stream directly from your Google Drive',
    catalogs: [
        {
            type: 'other',
            id: 'gdrive_root',
            name: 'Google Drive Files'
        }
    ],
    resources: ['catalog', 'stream'],
    types: ['movie', 'series', 'other'],
    idPrefixes: ['gdrive:']
};

const builder = new addonBuilder(manifest);

// 3. The Catalog Handler: Fetch files from Google Drive
builder.defineCatalogHandler(async ({ type, id }) => {
    if (id === 'gdrive_root') {
        try {
            const res = await drive.files.list({
                q: "'root' in parents and trashed = false", // Only get files in the main drive, ignore trash
                fields: 'files(id, name, mimeType)',
                pageSize: 50 // Limit to 50 items for now
            });
            
            const metas = res.data.files.map(file => ({
                id: `gdrive:${file.id}`,
                type: 'other',
                name: file.name,
                posterShape: 'square',
                poster: 'https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png' // generic icon
            }));

            return { metas };
        } catch (error) {
            console.error("Drive API Error:", error.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// 4. The Stream Handler: (We will build the video player connection next)
builder.defineStreamHandler(async ({ type, id }) => {
    return { streams: [] }; 
});

// 5. Start the Stremio Addon Server
// This is the line that changed! It now checks for a cloud port first.
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log('M Drive Addon ready for the cloud!');