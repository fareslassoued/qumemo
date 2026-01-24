#!/bin/bash
# WSL2 CUDA setup and hardening script for Quran Audio Aligner

set -e

echo "=== Quran Audio Aligner - Environment Setup ==="

# WSL2 stability settings
export UV_CONCURRENT_DOWNLOADS=1
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

echo "[1/4] Setting environment variables..."
echo "  UV_CONCURRENT_DOWNLOADS=$UV_CONCURRENT_DOWNLOADS"
echo "  PYTORCH_CUDA_ALLOC_CONF=$PYTORCH_CUDA_ALLOC_CONF"

# Check nvidia-smi availability
echo ""
echo "[2/4] Checking NVIDIA driver..."
if command -v nvidia-smi &> /dev/null; then
    echo "  nvidia-smi found"
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>/dev/null || echo "  (Unable to query GPU info)"
else
    echo "  WARNING: nvidia-smi not found. GPU acceleration may not work."
    echo "  Install NVIDIA drivers for WSL2: https://developer.nvidia.com/cuda/wsl"
fi

# Fix libcuda.so symlinks if needed (common WSL2 issue)
echo ""
echo "[3/4] Checking libcuda.so symlinks..."
CUDA_LIB_PATH="/usr/lib/wsl/lib"
if [ -d "$CUDA_LIB_PATH" ]; then
    if [ ! -e "$CUDA_LIB_PATH/libcuda.so" ] && [ -e "$CUDA_LIB_PATH/libcuda.so.1" ]; then
        echo "  Creating libcuda.so symlink..."
        sudo ln -sf "$CUDA_LIB_PATH/libcuda.so.1" "$CUDA_LIB_PATH/libcuda.so" 2>/dev/null || \
            echo "  WARNING: Could not create symlink (may need sudo)"
    else
        echo "  libcuda.so symlink OK"
    fi
else
    echo "  WSL CUDA lib path not found (non-WSL environment?)"
fi

# Test PyTorch CUDA availability
echo ""
echo "[4/4] Testing PyTorch CUDA availability..."
if command -v uv &> /dev/null; then
    # Check if dependencies are installed
    if uv run python -c "import torch" 2>/dev/null; then
        CUDA_AVAILABLE=$(uv run python -c "import torch; print('CUDA Available:', torch.cuda.is_available()); print('Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')" 2>/dev/null)
        echo "  $CUDA_AVAILABLE"
    else
        echo "  Dependencies not installed yet. Run: uv sync --extra cuda"
    fi
else
    echo "  uv not found. Install it: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Install dependencies: uv sync --extra cuda  (or --extra cpu)"
echo "  2. Run aligner: uv run python aligner.py --surah 1"
echo ""

# Export variables for current shell
export UV_CONCURRENT_DOWNLOADS=1
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
