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
        this.dataFile = new Blob(); // Initialize Blob to store file data
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

        this.activeConnections[segmentIndex] = true; // Mark segmentIndex as active
        this.downloadSegment(segmentIndex)
            .then(() => {
                delete this.activeConnections[segmentIndex]; // Remove segmentIndex from active list
                this.downNext(); // Call downNext to download the next segment
            })
            .catch((error) => {
                delete this.activeConnections[segmentIndex]; // Remove segmentIndex from active list
                this.retryQueue.push(segmentIndex); // Push segmentIndex to retry queue
                this.downNext(); // Call downNext to try downloading another segment
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
        // Sort segments in the correct order and write to Blob
        this.downloadedSegments.forEach(segment => {
            this.dataFile = new Blob([this.dataFile, segment], { type: 'application/octet-stream' });
        });

        const statusBar = document.getElementById('status-bar');
        statusBar.style.backgroundColor = 'green'; // Set to green on completion
        statusBar.textContent = "Download Complete";

        const url = window.URL.createObjectURL(this.dataFile);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = this.fileName; // Use the actual file name
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);

        setTimeout(hideStatusBar, 2000); // Hide the status bar after 2 seconds
    };

    Downloader.prototype.abort = function () {
        this.aborted = true;
    };

    function hideStatusBar() {
        const statusBar = document.getElementById('status-bar');
        if (statusBar) {
            statusBar.classList.remove('visible');
            statusBar.classList.add('hidden');
            statusBar.style.backgroundColor = 'yellow'; 
        }
    }

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
