"""Makes the generated Android project sign its release build with our key.

Run after `expo prebuild`. The key's location and passwords come from the
BB_STORE_FILE, BB_STORE_PASSWORD, BB_KEY_ALIAS and BB_KEY_PASSWORD variables.
"""
import re

path = 'android/app/build.gradle'
text = open(path).read()

release_config = """    signingConfigs {
        release {
            storeFile file(System.getenv('BB_STORE_FILE'))
            storePassword System.getenv('BB_STORE_PASSWORD')
            keyAlias System.getenv('BB_KEY_ALIAS')
            keyPassword System.getenv('BB_KEY_PASSWORD')
        }
"""
text, n = re.subn(r'    signingConfigs \{\n', release_config, text, count=1)
assert n == 1, 'signingConfigs block not found'

# In the release build type, sign with the release key instead of the debug key.
match = re.search(r'buildTypes \{.*?release \{.*?\n        \}', text, re.S)
assert match, 'release build type not found'
fixed = match.group(0).replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release')
assert fixed != match.group(0), 'release build type did not use the debug key'
text = text.replace(match.group(0), fixed, 1)
open(path, 'w').write(text)
print('Release builds will be signed with', 'BB_KEY_ALIAS')
