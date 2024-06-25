const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const FILE_DIR = path.join(__dirname, 'files');

io.on('connection', (socket) => {
    console.log('New client connected');
    
    socket.on('upload', (data) => {
        const { filename, content } = data;
        fs.writeFileSync(path.join(FILE_DIR, filename), content, 'binary');
        socket.emit('uploadStatus', 'Upload successful');
    });
    
    socket.on('download', (filename) => {
        const filePath = path.join(FILE_DIR, filename);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'binary');
            socket.emit('download', { filename, content });
        } else {
            socket.emit('downloadStatus', 'File not found');
        }
    });
    
    socket.on('list', () => {
        const files = fs.readdirSync(FILE_DIR);
        socket.emit('fileList', files);
    });
    
    socket.on('delete', (filename) => {
        const filePath = path.join(FILE_DIR, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            socket.emit('deleteStatus', 'File deleted');
        } else {
            socket.emit('deleteStatus', 'File not found');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
