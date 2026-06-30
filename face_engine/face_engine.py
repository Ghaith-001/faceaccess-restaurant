import os
import pickle
import threading
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import face_recognition
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'faces_db.pkl')
CONFIDENCE_THRESHOLD = float(os.environ.get('FACE_CONFIDENCE_THRESHOLD', 0.55))

_db_lock = threading.Lock()


def load_db():
    if os.path.exists(DB_PATH):
        with open(DB_PATH, 'rb') as f:
            return pickle.load(f)
    return {}


def save_db(db):
    # Write to temp file then replace atomically to avoid corruption on crash
    tmp_path = DB_PATH + '.tmp'
    with open(tmp_path, 'wb') as f:
        pickle.dump(db, f)
    os.replace(tmp_path, DB_PATH)


@app.route('/health', methods=['GET'])
def health():
    db = load_db()
    return jsonify({'status': 'ok', 'persons': len(db), 'threshold': CONFIDENCE_THRESHOLD})


@app.route('/encode', methods=['POST'])
def encode():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'JSON body required'}), 400

    person_id = data.get('personId')
    person_name = data.get('name')
    image_paths = data.get('imagePaths', [])

    if not person_id or not image_paths:
        return jsonify({'success': False, 'error': 'personId and imagePaths required'}), 400

    encodings = []
    for path in image_paths:
        try:
            img = face_recognition.load_image_file(path)
            faces = face_recognition.face_encodings(img)
            if faces:
                encodings.append(faces[0])
        except Exception as e:
            logger.warning(f'Error processing {path}: {e}')

    if not encodings:
        return jsonify({'success': False, 'error': 'No face detected in any photo'}), 422

    avg_encoding = np.mean(encodings, axis=0)

    with _db_lock:
        db = load_db()
        db[person_id] = {
            'name': person_name,
            'encoding': avg_encoding,
            'sampleCount': len(encodings)
        }
        save_db(db)

    logger.info(f'Enrolled {person_name} ({person_id}) with {len(encodings)} samples')
    return jsonify({'success': True, 'samplesUsed': len(encodings)})


@app.route('/recognize', methods=['POST'])
def recognize():
    data = request.get_json()
    if not data:
        return jsonify({'recognized': False, 'error': 'JSON body required'}), 400

    image_path = data.get('imagePath')
    if not image_path:
        return jsonify({'recognized': False, 'error': 'imagePath required'}), 400

    try:
        img = face_recognition.load_image_file(image_path)
    except Exception as e:
        return jsonify({'recognized': False, 'error': str(e)}), 422

    face_encodings = face_recognition.face_encodings(img)

    if not face_encodings:
        return jsonify({'recognized': False, 'reason': 'no_face_detected'})

    unknown_encoding = face_encodings[0]

    with _db_lock:
        db = load_db()

    if not db:
        return jsonify({'recognized': False, 'reason': 'empty_database'})

    ids = list(db.keys())
    known_encodings = [db[pid]['encoding'] for pid in ids]

    distances = face_recognition.face_distance(known_encodings, unknown_encoding)
    best_idx = int(np.argmin(distances))
    best_distance = float(distances[best_idx])
    confidence = round(1.0 - best_distance, 4)

    if best_distance <= CONFIDENCE_THRESHOLD:
        person_id = ids[best_idx]
        person_name = db[person_id]['name']
        logger.info(f'Recognized: {person_name} (confidence={confidence:.2f})')
        return jsonify({
            'recognized': True,
            'personId': person_id,
            'person': person_name,
            'confidence': confidence,
            'distance': best_distance
        })

    logger.info(f'Unknown face (best distance={best_distance:.2f})')
    return jsonify({
        'recognized': False,
        'reason': 'below_threshold',
        'confidence': confidence
    })


@app.route('/delete/<person_id>', methods=['DELETE'])
def delete_person(person_id):
    with _db_lock:
        db = load_db()
        if person_id not in db:
            return jsonify({'success': False, 'error': 'Person not found'}), 404
        name = db[person_id]['name']
        del db[person_id]
        save_db(db)

    logger.info(f'Deleted {name} ({person_id})')
    return jsonify({'success': True})


@app.route('/persons', methods=['GET'])
def list_persons():
    db = load_db()
    result = [
        {'personId': pid, 'name': db[pid]['name'], 'samples': db[pid].get('sampleCount', 0)}
        for pid in db
    ]
    return jsonify(result)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    logger.info(f'Face engine starting on port {port}')
    app.run(host='0.0.0.0', port=port, debug=False)
