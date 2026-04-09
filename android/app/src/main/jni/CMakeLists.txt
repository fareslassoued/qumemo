cmake_minimum_required(VERSION 3.22.1)
project(qumemo-whisper)

# ── Fetch whisper.cpp from GitHub ──────────────────────────
include(FetchContent)
FetchContent_Declare(
    whisper
    URL https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.8.4.tar.gz
)

# Build whisper as a static library (no examples/tests)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS      OFF CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(whisper)

# ── JNI bridge library ────────────────────────────────────
add_library(whisper_jni SHARED whisper_jni.c)

target_link_libraries(whisper_jni
    whisper
    log      # Android logging
)

# Fix 16KB page size alignment for Android 15+ (Pixel 7)
target_link_options(whisper_jni PRIVATE
    "-Wl,-z,max-page-size=16384"
)

target_include_directories(whisper_jni PRIVATE
    ${whisper_SOURCE_DIR}/include
    ${whisper_SOURCE_DIR}/ggml/include
)
