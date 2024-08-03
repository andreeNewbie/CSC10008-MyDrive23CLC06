const uploader = function (socket, token, fileId, file, segmentSize, numberOfSegments) {
    function Uploader() {
        this.segmentSize = segmentSize;
        this.file = file;
        this.fileId = fileId;
        this.numberOfSegments = numberOfSegments;
        this.threadsQuantity = 20; 
        this.aborted = false;
        this.uploadedSize = 0;
        this.progressCache = {};
        this.activeConnections = {};
        this.retryQueue = [];
    }

    Uploader.prototype.setOptions = function (options = {}) {
        this.segmentSize = options.segmentSize || this.segmentSize;
        this.threadsQuantity = options.threadsQuantity || this.threadsQuantity;
    };

    Uploader.prototype.setupFile = function (file) {
        this.file = file;
    };

    Uploader.prototype.start = function () {
        if (!this.file) {
            throw new Error("Can't start uploading: file has not been chosen");
        }

        const chunksQuantity = this.numberOfSegments;
        this.chunksQueue = new Array(chunksQuantity).fill().map((_, index) => index).reverse();
        this.retryQueue = [];

        this.sendNext();
    };

    Uploader.prototype.sendNext = function () {
        if (this.aborted) return;

        const activeConnections = Object.keys(this.activeConnections).length;

        if (activeConnections > this.threadsQuantity) {
            return;
        }

        if (!this.chunksQueue.length && !this.retryQueue.length) {
            if (activeConnections === 0) {
                this.complete(null);
            }
            return;
        }

        let chunkId;
        if (this.chunksQueue.length > 0) {
            chunkId = this.chunksQueue.pop();
        } else if (this.retryQueue.length > 0) {
            chunkId = this.retryQueue.pop();
        } else {
            console.log("No chunks left to process.");
            return;
        }

        const sentSize = chunkId * this.segmentSize;
        const chunk = this.file.slice(sentSize, sentSize + this.segmentSize);
        this.activeConnections[chunkId] = true;

        this.sendChunk(chunk, chunkId)
            .then(() => {
                delete this.activeConnections[chunkId];
                this.uploadedSize += chunk.size;
                if (this.onProgress) this.onProgress(this.uploadedSize, this.file.size);
                this.sendNext();
            })
            .catch((error) => {
                delete this.activeConnections[chunkId];
                this.retryQueue.push(chunkId);
                this.sendNext();
            });

        this.sendNext();
    };

    Uploader.prototype.sendChunk = function (chunk, id) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const segmentData = event.target.result;
                socket.emit('upload_segment', {
                    token: token,
                    file_id: this.fileId,
                    index: id,
                    data: segmentData
                });

                socket.once('upload_segment_response', (data) => {
                    if (data.status === 'ok') {
                        resolve();
                    } else {
                        reject(new Error('Failed chunk upload'));
                    }
                });
            };
            reader.onerror = (error) => {
                reject(error);
            };
            reader.readAsArrayBuffer(chunk);
        });
    };

    Uploader.prototype.complete = function (error) {
        if (error && !this.aborted) {
            this.end(error);
            return;
        }
        const statusBar = document.getElementById('status-bar');
        statusBar.style.backgroundColor = 'green';
        statusBar.textContent = "Upload Complete";
        this.end(error);
    };

    Uploader.prototype.abort = function () {
        Object.keys(this.activeConnections).forEach((id) => {
            this.activeConnections[id].abort();
        });

        this.aborted = true;
    };

    Uploader.prototype.on = function (method, callback) {
        if (typeof callback !== "function") {
            callback = () => {};
        }

        this[method] = callback;
    };

    function hideStatusBar() {
        const statusBar = document.getElementById('status-bar');
        if (statusBar) {
            statusBar.classList.remove('visible');
            statusBar.classList.add('hidden');
            statusBar.style.backgroundColor = 'yellow'; // Reset to yellow
        }
    }

    function showMessageBox(message) {
        const messageBox = document.querySelector('.message-box');
        messageBox.innerHTML = `
            <p>${message}</p>
            <button id="confirmButton">OK</button>
        `;
        messageBox.classList.add('visible');

        const confirmButton = document.getElementById('confirmButton');
        confirmButton.removeEventListener('click', hideMessageBox); // Remove previous event listener if any
        confirmButton.addEventListener('click', hideMessageBox, { once: true }); // Add event listener with { once: true } option
    }

    function hideMessageBox() {
        const messageBox = document.querySelector('.message-box');
        messageBox.classList.remove('visible');
    }

    const multithreadedUploader = new Uploader();

    return {
        options: function (options) {
            multithreadedUploader.setOptions(options);
            return this;
        },
        send: function () {
            multithreadedUploader.start();
            return this;
        },
        continue: function () {
            multithreadedUploader.sendNext();
        },
        onProgress: function (callback) {
            multithreadedUploader.on("onProgress", callback);
            return this;
        },
        end: function (callback) {
            multithreadedUploader.on("end", callback);
            multithreadedUploader.start();
            return this;
        },
        abort: function () {
            multithreadedUploader.abort();
        }
    };
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = uploader;
}
