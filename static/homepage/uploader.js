const uploader = function (socket, token, fileId, file, segmentSize, numberOfSegments) {
    function Uploader() {
        this.segmentSize = segmentSize;
        this.file = file;
        this.fileId = fileId;
        this.numberOfSegments = numberOfSegments;
        this.aborted = false;
        this.uploadedSize = 0;
        this.progressCache = {};
        this.activeConnections = {};
        this.retryQueue = [];
    }

    Uploader.prototype.setOptions = function (options = {}) {
        this.segmentSize = options.segmentSize || this.segmentSize;
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

    Uploader.prototype.send = function () {
        this.start();
    };

    Uploader.prototype.sendNext = function () {
        if (this.aborted) return;

        if (!this.chunksQueue.length && !this.retryQueue.length) {
            if (Object.keys(this.activeConnections).length === 0) {
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
            // Không có phân đoạn nào trong hàng đợi
            console.log("No chunks left to process.");
            return;
        }

        const sentSize = chunkId * this.segmentSize;
        const chunk = this.file.slice(sentSize, sentSize + this.segmentSize);

        this.sendChunk(chunk, chunkId)
            .then(() => {
                this.sendNext();
            })
            .catch((error) => {
                this.retryQueue.push(chunkId);
                this.sendNext();
            });
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
                        delete this.activeConnections[id];
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

    Uploader.prototype.handleProgress = function (chunkId, event) {
        if (event.type === "progress" || event.type === "error" || event.type === "abort") {
            this.progressCache[chunkId] = event.loaded;
        }

        if (event.type === "loadend") {
            this.uploadedSize += this.progressCache[chunkId] || 0;
            delete this.progressCache[chunkId];
        }

        const inProgress = Object.keys(this.progressCache).reduce((memo, id) => memo += this.progressCache[id], 0);
        const sentLength = Math.min(this.uploadedSize + inProgress, this.file.size);

        this.onProgress({
            loaded: sentLength,
            total: this.file.size
        });
    };

    Uploader.prototype.complete = function (error) {
        if (error && !this.aborted) {
            this.end(error);
            return;
        }
        setTimeout(() => this.start(), 0);
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
