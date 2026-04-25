import os
import re

directory = 'lib/screens'

for filename in os.listdir(directory):
    if filename.endswith(".dart"):
        filepath = os.path.join(directory, filename)
        with open(filepath, 'r') as file:
            content = file.read()
            
        # Replace background Color(0xFF1F2A40) with Theme.of(context).cardColor
        content = content.replace("const Color(0xFF1F2A40)", "Theme.of(context).cardColor")
        content = content.replace("Color(0xFF1F2A40)", "Theme.of(context).cardColor")
        
        # Replace common text styles
        content = content.replace("color: Colors.white54", "color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)")
        content = content.replace("color: Colors.white70", "color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7)")
        content = content.replace("color: Colors.white38", "color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)")
        content = content.replace("color: Colors.white10", "color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10)")
        content = content.replace("color: Colors.white24", "color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.24)")
        content = content.replace("color: Colors.white", "color: Theme.of(context).colorScheme.onSurface")
        
        # Fix some const Text that now use Theme.of(context)
        content = re.sub(r'const Text\((.*?),\s*style:\s*const TextStyle\(', r'Text(\1, style: TextStyle(', content)
        content = re.sub(r'const Text\((.*?),\s*style:\s*TextStyle\(', r'Text(\1, style: TextStyle(', content)
        content = re.sub(r'const TextStyle\(color:\s*Theme\.of', r'TextStyle(color: Theme.of', content)
        content = re.sub(r'const InputDecoration\(([^)]*?)labelStyle:\s*const TextStyle', r'InputDecoration(\1labelStyle: TextStyle', content)
        content = re.sub(r'const InputDecoration\(([^)]*?)labelStyle:\s*TextStyle', r'InputDecoration(\1labelStyle: TextStyle', content)
        content = re.sub(r'const BoxDecoration\((.*?color:\s*Theme\.of)', r'BoxDecoration(\1', content)

        with open(filepath, 'w') as file:
            file.write(content)
