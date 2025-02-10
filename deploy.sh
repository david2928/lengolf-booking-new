#!/bin/bash

# Configuration
PROJECT_ID="lengolf-booking-system-436804"
SERVICE_NAME="lengolf-booking-new"
REGION="asia-southeast1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Print current step
echo "🚀 Starting deployment process..."

# Ensure we're logged in and set the correct project
echo "🔑 Setting Google Cloud project..."
gcloud config set project ${PROJECT_ID}

# Build the Docker image
echo "🏗️ Building Docker image..."
docker build -t ${IMAGE_NAME} .

# Push the image to Google Container Registry
echo "⬆️ Pushing image to Google Container Registry..."
docker push ${IMAGE_NAME}

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --port 8080

# Get the service URL
echo "🔍 Getting service URL..."
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format='value(status.url)')

echo "✅ Deployment complete!"
echo "🌐 Service URL: ${SERVICE_URL}" 