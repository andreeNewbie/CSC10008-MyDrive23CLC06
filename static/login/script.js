document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginMessageDiv = document.getElementById('login-message');
    const registerMessageDiv = document.getElementById('register-message');
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const registerLink = document.getElementById('register-link');
    const loginLink = document.getElementById('login-link');
    const body = document.body;

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('http://localhost:3000/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                loginMessageDiv.textContent = data.message;
                loginMessageDiv.style.display = 'block';
                loginMessageDiv.style.color = 'green';
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', username);
                window.location.href = "static/homepage/homepage.html";
            } else {
                loginMessageDiv.textContent = data.message;
                loginMessageDiv.style.display = 'block';
                loginMessageDiv.style.color = 'red';
            }
        } catch (error) {
            loginMessageDiv.textContent = 'Error: ' + error.message;
            loginMessageDiv.style.display = 'block';
            loginMessageDiv.style.color = 'red';
            console.error('Error:', error);
        }
    });

    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;

        try {
            const response = await fetch('http://localhost:3000/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                loginMessageDiv.textContent = data.message;
                loginMessageDiv.style.display = 'block';
                loginMessageDiv.style.color = 'blue';
                document.getElementById('username').value = data.username;
                document.getElementById('password').value = data.password;
                registerContainer.style.display = 'block';
                loginContainer.style.display = 'block';
                body.classList.remove('register-mode');
                body.classList.add('login-mode');
            } else {
                registerMessageDiv.textContent = data.message;
                registerMessageDiv.style.display = 'block';
                registerMessageDiv.style.color = 'red';
            }
        } catch (error) {
            registerMessageDiv.textContent = 'Error: ' + error.message;
            registerMessageDiv.style.display = 'block';
            registerMessageDiv.style.color = 'red';
            console.error('Error:', error);
        }
    });

    registerLink.addEventListener('click', function(event) {
        event.preventDefault();
        body.classList.remove('login-mode');
        body.classList.add('register-mode');
    });

    loginLink.addEventListener('click', function(event) {
        event.preventDefault();
        body.classList.remove('register-mode');
        body.classList.add('login-mode');
    });

    body.classList.add('login-mode');
});
