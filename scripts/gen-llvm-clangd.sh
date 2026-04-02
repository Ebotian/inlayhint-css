#!/usr/bin/env bash
set -euo pipefail

workspace_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$workspace_root/llvm-project-main"
build_root="$workspace_root/build/llvm-clangd"

mkdir -p "$build_root"

cmake -S "$repo_root/llvm" -B "$build_root" -G Ninja \
  -DLLVM_ENABLE_PROJECTS="clang;clang-tools-extra" \
  -DLLVM_TARGETS_TO_BUILD=host \
  -DLLVM_ENABLE_ASSERTIONS=ON \
  -DBUILD_TESTING=OFF \
  -DCMAKE_EXPORT_COMPILE_COMMANDS=ON

cat > "$repo_root/.clangd" <<EOF
CompileFlags:
  CompilationDatabase: ../build/llvm-clangd
EOF

ln -sfn "$build_root/compile_commands.json" "$repo_root/compile_commands.json"

echo "Generated: $repo_root/.clangd"
echo "Generated: $repo_root/compile_commands.json -> $build_root/compile_commands.json"
echo "Build directory: $build_root"
