import re
import sys

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Remove const from constructors where AppColors was used, since Theme.of is dynamic
    # This is a bit tricky, we will just use a simpler regex for AppColors.
    # Instead of full regex, we'll replace the static references with Theme.of(context)
    # We will assume `final colors = Theme.of(context).colorScheme;` is available or we use `Theme.of(context)` directly.
    
    replacements = {
        'AppColors.darkBg': 'Theme.of(context).scaffoldBackgroundColor',
        'AppColors.darkCard': 'Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface',
        'AppColors.darkSurface': 'Theme.of(context).colorScheme.surfaceContainerHighest',
        'AppColors.darkBorder': 'Theme.of(context).colorScheme.outline',
        'AppColors.darkBorderSubtle': 'Theme.of(context).colorScheme.outlineVariant',
        'AppColors.textWhite': 'Theme.of(context).colorScheme.onSurface',
        'AppColors.textMuted': 'Theme.of(context).colorScheme.onSurfaceVariant',
        'AppColors.textFaint': 'Theme.of(context).colorScheme.onSurface.withOpacity(0.4)',
        'AppColors.orange': 'Theme.of(context).colorScheme.primary',
        'AppColors.amber': 'Theme.of(context).colorScheme.secondary',
        'AppColors.danger': 'Theme.of(context).colorScheme.error',
        'AppColors.success': 'const Color(0xFF10B981)', # Hardcoded for now since no success in colorScheme
        'AppColors.info': 'const Color(0xFF3B82F6)',
        'AppColors.orangeGlow': 'Theme.of(context).colorScheme.primary.withOpacity(0.4)',
    }

    # Remove const where it precedes a widget that will now have Theme.of(context)
    content = re.sub(r'const\s+BoxDecoration', 'BoxDecoration', content)
    content = re.sub(r'const\s+TextStyle', 'TextStyle', content)
    content = re.sub(r'const\s+Icon\(', 'Icon(', content)
    content = re.sub(r'const\s+Text\(', 'Text(', content)
    content = re.sub(r'const\s+BorderSide', 'BorderSide', content)
    content = re.sub(r'const\s+Row', 'Row', content)
    content = re.sub(r'const\s+Column', 'Column', content)
    content = re.sub(r'const\s+Center', 'Center', content)
    content = re.sub(r'const\s+Padding', 'Padding', content)
    content = re.sub(r'const\s+SizedBox', 'SizedBox', content)
    content = re.sub(r'const\s+Expanded', 'Expanded', content)
    
    for old, new in replacements.items():
        content = content.replace(old, new)

    with open(filepath, 'w') as f:
        f.write(content)

process_file('lib/screens/dashboard_screen.dart')
process_file('lib/screens/main_shell.dart')
process_file('lib/screens/login_screen.dart')
