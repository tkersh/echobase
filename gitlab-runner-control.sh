#!/bin/bash

# GitLab Runner Control Script
# Manages the GitLab Runner process running in user-mode on macOS

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_runner_process() {
    pgrep -f "gitlab-runner run" > /dev/null 2>&1
}

start_runner() {
    if check_runner_process; then
        print_warning "GitLab Runner is already running"
        PID=$(pgrep -f "gitlab-runner run")
        print_info "PID: $PID"
        return 0
    fi

    print_info "Starting GitLab Runner..."
    nohup gitlab-runner run > ~/.gitlab-runner/runner.log 2>&1 &
    sleep 2

    if check_runner_process; then
        PID=$(pgrep -f "gitlab-runner run")
        print_info "GitLab Runner started successfully (PID: $PID)"
        print_info "Logs: ~/.gitlab-runner/runner.log"
    else
        print_error "Failed to start GitLab Runner"
        exit 1
    fi
}

stop_runner() {
    if ! check_runner_process; then
        print_warning "GitLab Runner is not running"
        return 0
    fi

    print_info "Stopping GitLab Runner..."
    PID=$(pgrep -f "gitlab-runner run")
    kill $PID 2>/dev/null || kill -9 $PID 2>/dev/null

    sleep 2

    if check_runner_process; then
        print_error "Failed to stop GitLab Runner"
        exit 1
    else
        print_info "GitLab Runner stopped successfully"
    fi
}

status_runner() {
    if check_runner_process; then
        PID=$(pgrep -f "gitlab-runner run")
        print_info "GitLab Runner is running (PID: $PID)"

        # Show recent log entries
        if [ -f ~/.gitlab-runner/runner.log ]; then
            echo ""
            echo "Recent log entries:"
            tail -20 ~/.gitlab-runner/runner.log | sed 's/\x1b\[[0-9;]*m//g' | tail -5
        fi

        return 0
    else
        print_warning "GitLab Runner is not running"
        return 1
    fi
}

view_logs() {
    if [ -f ~/.gitlab-runner/runner.log ]; then
        print_info "Viewing GitLab Runner logs (Ctrl+C to exit)..."
        tail -f ~/.gitlab-runner/runner.log
    else
        print_error "Log file not found: ~/.gitlab-runner/runner.log"
        exit 1
    fi
}

restart_runner() {
    print_info "Restarting GitLab Runner..."
    stop_runner
    sleep 1
    start_runner
}

case "$1" in
    start)
        start_runner
        ;;
    stop)
        stop_runner
        ;;
    restart)
        restart_runner
        ;;
    status)
        status_runner
        ;;
    logs)
        view_logs
        ;;
    *)
        echo "GitLab Runner Control Script"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the GitLab Runner"
        echo "  stop     - Stop the GitLab Runner"
        echo "  restart  - Restart the GitLab Runner"
        echo "  status   - Check if the runner is running"
        echo "  logs     - View runner logs in real-time"
        echo ""
        exit 1
        ;;
esac

exit 0
