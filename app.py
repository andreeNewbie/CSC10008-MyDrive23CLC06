from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
import gridfs
import jwt
import datetime
from functools import wraps
from flask_socketio import SocketIO, emit
import threading
import math

app = Flask(__name__, static_folder='static')
CORS(app, resources={r"/*": {"origins": "*"}})
app.config['SECRET_KEY'] = 'your_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

client = MongoClient('mongodb+srv://csc10008:HCMUS-23@hnm.kemmutd.mongodb.net/server-cloud?retryWrites=true&w=majority')
db = client.get_database('server-cloud')
users_collection = db['userInfo']
fs = gridfs.GridFS(db, collection='file-cloud')

@app.route('/')
def serve_index():
    return send_from_directory('static/login', 'index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/homepage')
def serve_homepage():
    return send_from_directory('static/homepage', 'homepage.html')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('x-access-token')
        if not token:
            return jsonify({'message': 'Token is missing!'}), 403
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = users_collection.find_one({'username': data['username']})
        except:
            return jsonify({'message': 'Token is invalid!'}), 403
        return f(current_user, *args, **kwargs)
    return decorated

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if users_collection.find_one({'username': username}):
        return jsonify({'message': 'User already exists'}), 400

    users_collection.insert_one({'username': username, 'password': password})
    return jsonify({'message': 'User registered successfully'}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    user = users_collection.find_one({'username': username})
    if not user:
        return jsonify({'message': 'User not found'}), 400

    if user['password'] != password:
        return jsonify({'message': 'Wrong password'}), 400

    token = jwt.encode({
        'username': username,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, app.config['SECRET_KEY'], algorithm="HS256")

    return jsonify({'message': 'Login successful', 'token': token}), 200

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

file_segments = {}
file_info = {}
lock = threading.Lock()
threads = []

def save_segment(segment_index, segment_data, file_id):
    with lock:
        file_segments[file_id][segment_index] = segment_data
           
def write_file(info, segments):
    data = b''.join(segments)
    fs.put(data, filename=info['file_name'], metadata={'owner': info['owner']})
    print("File written to database successfully.")
    
@socketio.on('upload_file_info')
def handle_upload_file_info(data):
    token = data.get('token')
    if not token:
        emit('upload_response', {'message': 'Token is missing!'}, room=request.sid)
        return

    try:
        decoded = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        current_user = users_collection.find_one({'username': decoded['username']})
        file_id = data.get('file_id')
        file_info[file_id] = {
            'file_name': data.get('file_name'),
            'number_of_segments': data.get('number_of_segments'),
            'owner': current_user['username'],
            'sid': request.sid,
        }
        print(f"Received file info of {file_info[file_id]['file_name']} from {file_info[file_id]['owner']}")
    except Exception as e:
        emit('upload_response', {'message': str(e)}, room=request.sid)

@socketio.on('upload_segment')
def handle_upload_segment(data):
    segment_data = data['data']
    segment_index = int(data['index'])
    file_id = data['file_id']
    
    if file_id not in file_info:
        emit('upload_segment_response', {'status': 'error', 'message': 'File info not found'}, room=request.sid) #Xu li loi nay
        return

    if file_id not in file_segments:
        file_segments[file_id] = [None] * file_info[file_id]['number_of_segments']
        
    if file_segments[file_id][segment_index] is None:
        socketio.start_background_task(target=save_segment, segment_index=segment_index, segment_data=segment_data, file_id=file_id)
        # thread = threading.Thread(target=save_segment, args=(segment_index, segment_data, file_id))
        # thread.start()
        print(f'Received segment {segment_index} of file {file_id}')
        # threads.append(thread)
        
    if None not in file_segments[file_id]:
        # for thread in threads:
        #     thread.join()
        write_file(file_info[file_id], file_segments[file_id])
        emit('upload_response', {'message': 'File uploaded successfully'}, room=file_info[file_id]['sid'])
        del file_segments[file_id]
        del file_info[file_id]
    else:
        emit('upload_segment_response', {'status': 'ok', 'message': f'Received segment {segment_index} of file {file_id}'}, room=file_info[file_id]['sid'])

    
@socketio.on('get_files')
def handle_get_files(data):
    token = data.get('token')

    if not token:
        emit('file_list', {'message': 'Token is missing!'}, room=request.sid)
        return

    try:
        decoded = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        current_user = users_collection.find_one({'username': decoded['username']})
        files = fs.find()
        files_list = [{'name': file.filename, 'owner': file.metadata['owner'], '_id': str(file._id)} for file in files]
        emit('file_list', files_list, room=request.sid)
    except Exception as e:
        emit('file_list', {'message': str(e)}, room=request.sid)

@socketio.on('download_file_info')
def handle_download_file_info(data):
    token = data.get('token')
    file_id = data.get('file_id')
    
    if not token:
        emit('download_response', {'message': 'Token is missing!'}, room=request.sid)
        return

    try:
        global file
        decoded = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        current_user = users_collection.find_one({'username': decoded['username']})
        file = fs.find_one({"_id": ObjectId(file_id)})
        
        if not file:
            emit('download_response', {'message': 'File not found'}, room=request.sid)
            return
        
        file_size = file.length
        segment_size = 300 * 1024  # 30KB segments
        number_of_segments = math.ceil(file_size / segment_size);

        global file_download_info
        global sent_segments
        
        sent_segments = {}
        sent_segments[file_id] = []
        
        file_download_info = {
            'file_name': file.filename,
            'file_size': file_size,
            'number_of_segments': number_of_segments,
            'file_id': file_id
        }

        emit('download_file_info', file_download_info, room=request.sid)
        print(f"Sent file info of file {file_download_info['file_name']}")

    except Exception as e:
        emit('download_response', {'message': str(e)}, room=request.sid)

@socketio.on('download_segment')
def handle_download_segment(data):
    token = data.get('token')
    file_id = data.get('file_id')
    segment_index = data.get('index')
    
    if segment_index in sent_segments[file_id]: 
        emit('download_segment_response', {'status': 'error', 'message': 'Segment have downloaded before'}, room=request.sid)
        return
    
    def thread_send_segment(token, file_id, segment_index, sid):
        if not token:
            socketio.emit('download_response', {'message': 'Token is missing!'}, room=sid)
            return
        try:
            segment_size = 300 * 1024  # 300KB segments
            file.seek(segment_index * segment_size)
            segment_data = file.read(segment_size)
            sent_segments[file_id].append(segment_index)
            socketio.emit('download_segment_response', {'index': segment_index, 'data': segment_data, 'file_id': file_id}, room=sid)
            print(f"Sent segment {segment_index} successfully.")
            if len(sent_segments[file_id]) == file_download_info['number_of_segments']:
                print(f"Download file {file_download_info['file_name']} successfully")
  
            
        except Exception as e:
            socketio.emit('download_response', {'message': str(e)}, room=sid)
            
    # thread = threading.Thread(target=thread_send_segment, args=(token, file_id, segment_index, request.sid))
    # thread.start()
    # threads.append(thread)    
    socketio.start_background_task(target=thread_send_segment, token=token, file_id=file_id, segment_index=segment_index, sid=request.sid)
        
if __name__ == '__main__':
    socketio.run(app, debug=True, port=3000)
