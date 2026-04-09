# Qumemo ASR — Android On-Device Whisper PoC

Minimal Android app to test on-device Arabic ASR using whisper.cpp with the
tarteel-base model (fine-tuned on Quran recitation).

## Prerequisites

- Android Studio (with NDK 25+ and CMake installed via SDK Manager)
- A GGML model file in `app/src/main/assets/models/`

## Getting the Model

### Option A: Convert tarteel-base from HuggingFace

```bash
# In the whisper.cpp repo (clone separately):
pip install torch transformers
python models/convert-h5-to-ggml.py tarteel-ai/whisper-base-ar-quran . models/

# Quantize for mobile:
cmake -B build && cmake --build build --config Release --target quantize
./build/bin/quantize models/ggml-model.bin models/ggml-tarteel-base-q5_1.bin q5_1
```

Copy the output file to `app/src/main/assets/models/ggml-tarteel-base-q5_1.bin`.

### Option B: Use generic whisper-base for initial testing

Download from https://huggingface.co/ggergov/whisper.cpp/resolve/main/ggml-base.bin
and place as `app/src/main/assets/models/ggml-base.bin`.

Then change `MODEL_FILENAME` in `MainActivity.kt` to `"ggml-base.bin"`.

## Build & Run

1. Open this directory (`android/`) in Android Studio
2. Wait for Gradle sync + CMake build (first build downloads whisper.cpp ~2min)
3. Connect Pixel 7 via USB (enable USB debugging in Developer Options)
4. Click Run

## Usage

1. Tap **Record** and recite Quran
2. Tap **Stop** when done
3. Tap **Transcribe** to run whisper.cpp inference
4. Compare the Arabic output against the expected Quran text

## Architecture

```
MainActivity.kt  →  WhisperLib.kt (JNI)  →  whisper_jni.c  →  whisper.cpp
     (UI)            (Kotlin bridge)         (C bridge)        (inference)
```

CMake `FetchContent` downloads whisper.cpp v1.7.3 at build time — no submodule needed.
