// renderer.js
const { ipcRenderer } = require('electron');
const downloadBtn = document.getElementById('downloadBtn');

downloadBtn.addEventListener('click', () => {
    // Change button text immediately
    if (downloadBtn.textContent === 'Start Download') {
        downloadBtn.textContent = 'Stop Download';
    } else {
        downloadBtn.textContent = 'Start Download';
    }
    ipcRenderer.send('toggle-download');
});

// Listen for download logs and status updates
ipcRenderer.on('download-log', (event, message) => {
    const logElement = document.getElementById('log');
    logElement.innerHTML += `<div>${message}</div>`;
    logElement.scrollTop = logElement.scrollHeight; // Auto-scroll
});

ipcRenderer.on('download-status', (event, status) => {
    const logElement = document.getElementById('log');
    logElement.innerHTML += `<div class="status">${status}</div>`;
});
