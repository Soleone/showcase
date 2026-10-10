# voice-notes

## Setup

You need Python 3.11 and a microphone. Clone the repo, then install the requirements and download the speech model the first time you run it, which takes a few minutes on a slow connection.

```sh
pip install -r requirements.txt
python app.py
```

Open the page it prints and hold the space bar to talk. Everything runs on your own machine: the audio never leaves it, and the transcripts are saved as text files in a folder next to the app. You can search them from the page, or open the folder in any editor you like.
