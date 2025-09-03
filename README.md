# Yappr - Voice to Text Chrome Extension

Advanced speech-to-text transcription using ElevenLabs STT with OpenAI AI enhancements and intelligent formatting.

## Features

- **Real-time Speech Recognition** - High-quality transcription using ElevenLabs STT
- **AI-Powered Text Enhancement** - OpenAI integration for intelligent formatting and cleanup
- **Universal Compatibility** - Works on any website with text input fields
- **Keyboard Shortcuts** - Quick access with customizable hotkeys
- **Smart Formatting** - Automatic punctuation, capitalization, and text structure
- **Session Management** - Save, organize, and manage transcription sessions
- **Analytics Dashboard** - Track usage statistics and performance
- **Privacy Focused** - All data stored locally in your browser

## Installation

### From Chrome Web Store
1. Visit the [Chrome Web Store](https://chrome.google.com/webstore) (link coming soon)
2. Search for "Yappr - Voice to Text"
3. Click "Add to Chrome"

### Manual Installation (Development)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The Yappr extension will appear in your browser toolbar

## Setup

1. **Get API Keys:**
   - [ElevenLabs API Key](https://elevenlabs.io/) - Required for speech-to-text
   - [OpenAI API Key](https://platform.openai.com/) - Optional, for AI text enhancement

2. **Configure the Extension:**
   - Click the Yappr icon in your browser toolbar
   - Go to Settings and enter your API keys
   - Customize your preferences and shortcuts

## Usage

### Basic Transcription
1. Click on any text input field on a webpage
2. Press the keyboard shortcut (`Ctrl+Shift+U` or `Cmd+Shift+U` on Mac)
3. Start speaking when the recording indicator appears
4. Press the shortcut again to stop recording
5. Your transcribed text will appear in the input field

### Advanced Features
- **Folders & Organization** - Create folders to organize your transcriptions
- **Session History** - Access previously recorded sessions
- **Analytics** - View detailed usage statistics
- **Custom Prompts** - Set up AI enhancement prompts for different contexts

## Keyboard Shortcuts

- `Ctrl+Shift+U` (`Cmd+Shift+U` on Mac) - Toggle recording
- `Alt+Period` - Alternative toggle shortcut

Shortcuts can be customized in Chrome's extension settings.

## Privacy & Security

- All transcriptions are stored locally in your browser
- API keys are securely stored using Chrome's encrypted storage
- No data is sent to third parties except the configured AI services
- You maintain full control over your data

## Development

This extension is built using:
- Manifest V3
- Vanilla JavaScript
- Chrome Extension APIs
- ElevenLabs STT API
- OpenAI API

### Project Structure
```
yappr-chrome-extension/
├── manifest.json          # Extension configuration
├── popup.html/js          # Main popup interface
├── content.js             # Content script for web page interaction
├── background.js          # Background service worker
├── settings.html/js       # Settings page
├── styles/               # CSS stylesheets
├── ref/                  # Icons and assets
└── *.html               # Various extension pages
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- **Website:** [yappr.pro](https://yappr.pro)
- **Issues:** Please report bugs and feature requests in the GitHub issues
- **Email:** Contact us through our website

## Changelog

### Version 2.0
- Initial open source release
- Enhanced AI integration
- Improved user interface
- Better session management
- Analytics dashboard

---

**Note:** This extension requires API keys from ElevenLabs and optionally OpenAI. Please review their respective terms of service and pricing before use.