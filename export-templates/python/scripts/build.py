import os
import shutil
import subprocess
import sys

def build():
    # Create dist directory
    dist_dir = 'dist'
    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir)
    os.makedirs(dist_dir)

    # Install dependencies to dist
    subprocess.check_call([
        sys.executable, '-m', 'pip', 
        'install', '-r', 'requirements.txt',
        '--target', dist_dir,
        '--platform', 'manylinux2014_x86_64',
        '--only-binary=:all:'
    ])

    # Copy source files
    src_dir = os.path.join('src')
    dst_dir = os.path.join(dist_dir)
    
    # Copy all Python files from src
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.py'):
                src_path = os.path.join(root, file)
                # Create relative path from src
                rel_path = os.path.relpath(src_path, src_dir)
                dst_path = os.path.join(dst_dir, rel_path)
                # Create directories if they don't exist
                os.makedirs(os.path.dirname(dst_path), exist_ok=True)
                shutil.copy2(src_path, dst_path)

    # Copy data directories if they exist
    for dir_name in ['examples', 'data']:
        src_path = os.path.join('src', dir_name)
        if os.path.exists(src_path):
            dst_path = os.path.join(dist_dir, dir_name)
            if os.path.exists(dst_path):
                shutil.rmtree(dst_path)
            shutil.copytree(src_path, dst_path)

if __name__ == "__main__":
    build() 