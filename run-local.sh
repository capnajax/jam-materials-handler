#!/bin/bash

PORT=8081
BASE_PATH=/materials
HOST=localhost
ADMIN_PORT=8082
ADMIN_HOST=localhost
INCLUDES_SERVICE_PORT=8088

cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

MATERIALS_DIR=$(cd "../jam-materials" && pwd)
INCLUDES_DIR=$(cd "../jam-navigator/htdocs" && pwd)

INCLUDES_SERVER_PID=''
MATERIALS_HANDLER_SERVER_PID=''

start_servers() {
  echo "Starting includes HTTP server on port $INCLUDES_SERVICE_PORT..."
  python3 -m http.server "$INCLUDES_SERVICE_PORT" \
    --directory "$INCLUDES_DIR" >/dev/null 2>&1 &
  INCLUDES_SERVER_PID=$!

  echo "Starting Materials Handler server on port $PORT..."
  INCLUDES_SERVICE_PORT=${INCLUDES_SERVICE_PORT} NODE_ENV=local node \
    "src/index.js" --port "$PORT" --base-path "$MATERIALS_DIR" &
  MATERIALS_HANDLER_SERVER_PID=$!

  echo '"R" to refresh servers, "Q" to quit.'
}

stop_pid() {
  local pid=$1
  echo "Stopping process with PID $pid..."
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in {1..25}; do
      if kill -0 "$pid" 2>/dev/null; then break; fi
      sleep 0.2
    done
    kill -9 "$pid" 2>/dev/null || true
  else
    echo "No process found with PID $pid"
    true
  fi
}

# Call this to stop the includes server
stop_servers() {
  if [ -n "${MATERIALS_HANDLER_SERVER_PID:-}" ]; then
    echo "Stopping materials handler server with PID ${MATERIALS_HANDLER_SERVER_PID}..."
    stop_pid "${MATERIALS_HANDLER_SERVER_PID}" || true
    MATERIALS_HANDLER_SERVER_PID=''
  fi
  if [ -n "${INCLUDES_SERVER_PID:-}" ]; then
    echo "Stopping includes HTTP server with PID ${INCLUDES_SERVER_PID}..."
    stop_pid "${INCLUDES_SERVER_PID}" || true
    INCLUDES_SERVER_PID=''
  fi
}

trap 'stop_servers' TERM

start_servers

while true; do
  read -r -n1 -s key
  case "$key" in
    [Rr])
      echo "Refreshing servers..."
      stop_servers
      start_servers
      ;;
    [Qq])
      echo "Quitting..."
      stop_servers
      exit 0
      ;;
    *)
      ;;
  esac
done
