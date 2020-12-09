PROFILE=$1
REGION=$2

set -e

function deploy_serverless {
    echo "Deploying serverless"
    start=`date +%s`

    ./node_modules/.bin/sls deploy --aws-profile $PROFILE --region $REGION

    end=`date +%s`
    runtime=$((end-start))

    echo "Serverless deploy done in ${runtime}s"
}

function deploy_docker {
  echo "Building docker image"
  start=`date +%s`

  REPO_ECR=`cat sls-stack-output.json | python -c 'import json,sys;obj=json.load(sys.stdin);print(obj["ECRRepository"])'`
  docker build batch_image -t $REPO_ECR:latest

  end=`date +%s`
  runtime=$((end-start))

  echo "Docker build done in ${runtime}s"

  echo "Pushing docker image to ECR"
  start=`date +%s`

  ACCOUNT_ID=$(aws sts get-caller-identity --profile $PROFILE | grep -oP '"Account": "(\K\d+)')
  aws ecr get-login-password --region $REGION --profile $PROFILE | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

  docker push $REPO_ECR:latest

  end=`date +%s`
  runtime=$((end-start))

  echo "Docker push done in ${runtime}s"
}

echo "Installing npm modules"
npm ci

deploy_serverless
deploy_docker