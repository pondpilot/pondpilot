# Import the user's Justfile if it exists
import? '~/.justfile'
import? '~/justfile'

# Show the list of available commands
default:
    just --list

docker-build:
    corepack enable
    yarn install --immutable
    yarn build
    docker build -t pondpilot:latest -f docker/Dockerfile --load .

docker-run:
    docker run -d -p 4173:443 --name pondpilot pondpilot:latest

docker-stop:
    docker stop pondpilot

check-and-fix:
    yarn typecheck
    yarn lint:fix
    yarn prettier:write
