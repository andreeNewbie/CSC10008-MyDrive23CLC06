const downloader = function (socket, token, fileId, fileName, segmentSize, numberOfSegments) {
    function Downloader() {
        this.segmentSize = segmentSize;
        this.fileId = fileId;
        this.fileName = fileName;
        this.numberOfSegments = numberOfSegments;
        this.downloadedSegments = new Array(numberOfSegments).fill(null);
        this.threadsQuantity = 5; 
        this.activeConnections = {};
        this.aborted = false;
        this.dataFile = null;
        this.chunksQueue = [];
        this.retryQueue = [];
    }

    Downloader.prototype.setOptions = function (options = {}) {
        this.segmentSize = options.segmentSize || this.segmentSize;
    };

    Downloader.prototype.start = function () {
        this.dataFile = new Blob(); // Khởi tạo Blob để lưu trữ dữ liệu của file
        this.chunksQueue = new Array(this.numberOfSegments).fill().map((_, index) => index).reverse();
        this.retryQueue = [];
        console.log("Download starting.");
        this.downChunks();
    };

    Downloader.prototype.downChunks = function () {
        if (this.aborted) return;

        console.log("Start download chunks");
        this.downNext();
    };

    Downloader.prototype.downNext = function () {
        if (this.aborted) return;

        const activeConnections = Object.keys(this.activeConnections).length;

        if (activeConnections >= this.threadsQuantity) {
            return;
        }
        
        if (!this.chunksQueue.length && !this.retryQueue.length) {
            if (activeConnections === 0) {
                console.log("Having received full segment.")
                this.completeDownload();
            }
            return;
        }

        let segmentIndex;
        if (this.chunksQueue.length > 0) {
            segmentIndex = this.chunksQueue.pop();
        } else if (this.retryQueue.length > 0) {
            segmentIndex = this.retryQueue.pop();
        } else {
            console.log("No segments left to process.");
            return;
        }

        this.activeConnections[segmentIndex] = true; // Đánh dấu segmentIndex là đang hoạt động
        this.downloadSegment(segmentIndex)
            .then(() => {
                delete this.activeConnections[segmentIndex]; // Xóa segmentIndex khỏi danh sách đang hoạt động
                this.downNext(); // Gọi lại downNext để tải đoạn tiếp theo
            })
            .catch((error) => {
                delete this.activeConnections[segmentIndex]; // Xóa segmentIndex khỏi danh sách đang hoạt động
                this.retryQueue.push(segmentIndex); // Đẩy segmentIndex vào hàng đợi retry
                this.downNext(); // Gọi lại downNext để thử tải đoạn khác
            });

        //this.downNext();
    };

    Downloader.prototype.downloadSegment = function (segmentIndex) {
        return new Promise((resolve, reject) => {
            if (this.aborted) return reject(new Error("Download aborted"));

            socket.emit('download_segment', {
                token: token,
                file_id: this.fileId,
                index: segmentIndex
            });
            console.log("Start download segment " + segmentIndex);
            socket.once('download_segment_response', (data) => {
                if (data.status === 'error' && data.message === 'Segment have downloaded before') {
                    resolve();
                }
                else if (data.index === segmentIndex && data.file_id === this.fileId) {
                    this.downloadedSegments[segmentIndex] = data.data;
                    console.log("Received segment " + segmentIndex);
                    resolve();
                } else {
                    reject(new Error("Failed segment download"));
                }
            });
        });
    };

    Downloader.prototype.completeDownload = function () {
        // Sắp xếp các segment theo đúng thứ tự và ghi vào Blob
        this.downloadedSegments.forEach(segment => {
            this.dataFile = new Blob([this.dataFile, segment], { type: 'application/octet-stream' });
        });

        const url = window.URL.createObjectURL(this.dataFile);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = this.fileName; // Sử dụng tên file thực tế
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    };

    Downloader.prototype.abort = function () {
        this.aborted = true;
    };

    const instance = new Downloader();

    return {
        setOptions: function (options) {
            instance.setOptions(options);
            return this;
        },
        start: function () {
            instance.start();
            return this;
        },
        downChunks: function () {
            instance.downChunks();
            return this;
        },
        downNext: function () {
            instance.downNext();
            return this;
        },
        abort: function () {
            instance.abort();
        }
    };
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = downloader;
}
