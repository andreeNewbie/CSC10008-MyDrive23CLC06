const uploader = function (socket, token, fileId, file, segmentSize, numberOfSegments) {
    function Uploader() {
        this.segmentSize = segmentSize;
        this.file = file;
        this.fileId = fileId;
        this.numberOfSegments = numberOfSegments;
        this.threadsQuantity = numberOfSegments; // Số lượng kết nối đồng thời
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

        for (let i = 0; i < this.threadsQuantity; i++) {
            this.sendNext();
        }
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
        this.activeConnections[chunkId] = true; // Đánh dấu chunkId là đang hoạt động

        this.sendChunk(chunk, chunkId)
            .then(() => {
                delete this.activeConnections[chunkId]; // Xóa chunkId khỏi danh sách đang hoạt động
                //this.sendNext(); // Gọi lại sendNext để gửi chunk tiếp theo
            })
            .catch((error) => {
                delete this.activeConnections[chunkId]; // Xóa chunkId khỏi danh sách đang hoạt động
                this.retryQueue.push(chunkId); // Đẩy chunkId vào hàng đợi retry
                this.sendNext(); // Gọi lại sendNext để thử gửi chunk khác
            });

        this.sendNext(); // Gọi sendNext để tiếp tục gửi chunk khác ngay lập tức
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
