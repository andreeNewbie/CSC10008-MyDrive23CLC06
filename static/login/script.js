document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const messageDiv = document.getElementById('message');
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const registerLink = document.getElementById('register-link');
    const loginLink = document.getElementById('login-link');

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault(); // Prevent form from submitting the default way

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('http://localhost:3000/login', { // Đảm bảo URL này là cổng 3000
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                messageDiv.textContent = data.message;
                messageDiv.style.display = 'block';
                messageDiv.style.color = 'green';
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', username);
                // Chuyển hướng đến trang chủ
                window.location.href = "static/homepage/homepage.html"; // Đảm bảo đường dẫn đúng
            } else {
                messageDiv.textContent = data.message;
                messageDiv.style.display = 'block';
                messageDiv.style.color = 'red';
            }
        } catch (error) {
            messageDiv.textContent = 'Error: ' + error.message;
            messageDiv.style.display = 'block';
            messageDiv.style.color = 'red';
            console.error('Error:', error);
        }
    });

    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault(); // Prevent form from submitting the default way

        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;

        try {
            const response = await fetch('http://localhost:3000/register', { // Đảm bảo URL này là cổng 3000
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                messageDiv.textContent = data.message;
                messageDiv.style.display = 'block';
                messageDiv.style.color = 'blue';
                // Quay lại form đăng nhập
                registerContainer.style.display = 'none';
                loginContainer.style.display = 'block';
            } else {
                messageDiv.textContent = data.message;
                messageDiv.style.display = 'block';
                messageDiv.style.color = 'red';
            }
        } catch (error) {
            messageDiv.textContent = 'Error: ' + error.message;
            messageDiv.style.display = 'block';
            messageDiv.style.color = 'red';
            console.error('Error:', error);
        }
    });

    registerLink.addEventListener('click', function(event) {
        event.preventDefault();
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
    });

    loginLink.addEventListener('click', function(event) {
        event.preventDefault();
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
    });
});
