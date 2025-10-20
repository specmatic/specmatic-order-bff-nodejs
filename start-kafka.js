const { execSync } = require('child_process');
const path = require('path');

const specmaticPath = path.resolve(__dirname, 'specmatic.yaml');
execSync(`docker run --rm -v "${specmaticPath}:/usr/src/app/specmatic.yaml" -p 9092:9092 -p 9999:9999 specmatic/specmatic-kafka virtualize`, { stdio: 'inherit' });
