document.addEventListener('DOMContentLoaded', () => {
    const socket = io('http://localhost:3000', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });

    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    if (!token) {
        window.location.href = "static/login/index.html";
    } else {
        document.getElementById('username').textContent = username;
    }

    const newFileButton = document.getElementById('new-file');
    const uploadModal = document.getElementById('upload-modal');
    const closeModal = document.getElementsByClassName('close')[0];
    const uploadForm = document.getElementById('upload-form');
    const fileTableBody = document.querySelector('#file-table tbody');

    newFileButton.addEventListener('click', () => {
        uploadModal.style.display = 'block';
    });

    closeModal.onclick = () => {
        uploadModal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target == uploadModal) {
            uploadModal.style.display = 'none';
        }
    };

    uploadForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(uploadForm);
        const file = formData.get('file');
        const fileId = `${file.name}-${Date.now()}`;
        const segmentSize = 300 * 1024; // 1MB segments
        const numberOfSegments = Math.ceil(file.size / segmentSize);

        socket.emit('upload_file_info', {
            token: token,
            file_id: fileId,
            file_name: file.name,
            number_of_segments: numberOfSegments
        });
        
        const uploaderInstance = uploader(socket, token, fileId, file, segmentSize, numberOfSegments);
        uploaderInstance.send();
    });

    socket.on('upload_response', (data) => {
        if (data.message === 'File uploaded successfully') {
            uploadModal.style.display = 'none';
            alert(data.message);
            socket.emit('get_files', { token: token });
        } else {
            alert("Error: " + data.message);
        }
    });
    
    function fetchFiles() {
        socket.emit('get_files', { token: token });
    }

    socket.on('file_list', (files) => {
        fileTableBody.innerHTML = '';
        files.forEach(file => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${file.name}</td>
                <td>${file.owner}</td>
                <td><button class="download-btn" data-id="${file._id}" title="Download ${file.name}">Download</button></td>
            `;
            fileTableBody.appendChild(row);
        });

        document.querySelectorAll('.download-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const fileId = event.target.dataset.id;
                socket.emit('download_file_info', { token: token, file_id: fileId });
            });
        });
    });


    socket.on('download_file_info', (data) => {
        const { file_name, file_size, number_of_segments, file_id } = data;
        
        const downloaderInstance = downloader(socket, token, file_id, file_name, 300 * 1024, number_of_segments);
        downloaderInstance.start();
    });


    socket.on('download_response', (data) => {
        if (data.message) {
            alert(data.message);
        }
    });

    fetchFiles();
});
