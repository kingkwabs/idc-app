from flask import Blueprint, request, jsonify
from auth_util import create_access_token
import os

bp = Blueprint('auth', __name__, url_prefix='/auth')


@bp.post('/login')
def login():
	data = request.get_json() or {}
	username = data.get('username')
	password = data.get('password')

	# Simple credential check via env (replace with real user store later)
	expected_user = os.getenv('APP_USER')
	expected_pass = os.getenv('APP_PASS')
	if not expected_user or not expected_pass:
		return jsonify({"error": "auth_not_configured"}), 500

	if username == expected_user and password == expected_pass:
		token = create_access_token(sub=username)
		return jsonify({"access_token": token})
	return jsonify({"error": "invalid_credentials"}), 401

