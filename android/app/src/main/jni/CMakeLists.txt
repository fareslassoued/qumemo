cmake_minimum_required(VERSION 3.22.1)
project(qumemo-whisper)

# ── Fetch whisper.cpp from GitHub ──────────────────────────
include(FetchContent)
FetchContent_Declare(
    whisper
    GIT_REPOSITORY https://github.com/ggergov/whisper.cpp.git
    GIT_TAG        v1.7.3
    GIT_SHALLOW    TRUE
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

target_include_directories(whisper_jni PRIVATE
    ${whisper_SOURCE_DIR}/include
    ${whisper_SOURCE_DIR}/ggml/include
)
