#!/bin/sh
echo "node $PWD/dist/cli/index.js "'$@' > /usr/local/bin/dcli
chmod +x /usr/local/bin/dcli
