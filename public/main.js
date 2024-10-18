const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

let isDownloading = false;
let win;
let downloadProcess = null;

// Disable GPU and GPU cache to avoid permission issues
app.commandLine.appendSwitch('disable-gpu'); // Disable GPU entirely (if not required for your app)
app.commandLine.appendSwitch('disable-gpu-compositing'); // Disable GPU compositing
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache'); // Disable the GPU disk cache

// Set a custom cache directory for Electron outside app.asar
const cacheDir = path.join(os.homedir(), 'steam-wallpaper-downloader-cache');
app.setPath('userData', cacheDir);

// Function to create the main application window
function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true, // Hide the menu bar
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Allows using Electron APIs in renderer process
        }
    });

    // Load index.html into the window
    win.loadFile('public/index.html');

    // Handle window close event
    win.on('closed', () => {
        win = null;
    });
}

// Handle app lifecycle events
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // Quit the app if all windows are closed (except on macOS)
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    // Recreate a window if none are open on macOS
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Handle download start/stop request from renderer process
ipcMain.on('toggle-download', (event) => {
    if (isDownloading) {
        // Stop the download process if it's running
        if (downloadProcess) {
            downloadProcess.on('exit', (code) => {
                isDownloading = false;
                downloadProcess = null;
                console.log('Download stopped.');
                event.reply('download-status', 'stopped');
            });

            downloadProcess.kill(); // Kill the process
        }
    } else {
        // Start the download process if not already running
        isDownloading = true;
        console.log('Starting download...');

        const downloadScriptPath = path.join(__dirname, 'download.js');
        downloadProcess = spawn(process.execPath, ['--expose-gc', downloadScriptPath], { stdio: 'pipe' });

        downloadProcess.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message) {
                console.log(`stdout: ${message}`);
                event.reply('download-log', message); // Send log to renderer
            }
        });

        downloadProcess.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (message) {
                console.error(`stderr: ${message}`);
                event.reply('download-log', message); // Send error logs to renderer
            }
        });

        downloadProcess.on('close', (code) => {
            isDownloading = false;
            downloadProcess = null;
            console.log(`download.js exited with code ${code}`);
            // event.reply('download-status', `finished with code ${code}`); // Notify renderer on completion
        });

        downloadProcess.on('error', (error) => {
            console.error('Failed to start subprocess:', error);
            isDownloading = false;
            downloadProcess = null;
            event.reply('download-status', 'error'); // Send error status to renderer
        });
    }
});

// Error handling for any uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
