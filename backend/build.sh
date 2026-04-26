#!/usr/bin/env bash
# Render runs this as the build command
set -e

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Collecting static files..."
python manage.py collectstatic --no-input

echo "Running migrations..."
python manage.py migrate

echo "Seeding initial data..."
python manage.py seed

echo "Build complete."
