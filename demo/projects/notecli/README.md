# notecli

Turns a folder of session logs into a daily journal you can actually read.

![A day of notes in the terminal](docs/hero.png)

## Install

```sh
npm install -g notecli
notecli ~/logs --since yesterday
```

notecli reads every log in the folder, groups entries by project and writes one Markdown note per day. Run it again and it only adds what is new, so you can put it in a cron job and forget about it. Notes you edit by hand are left alone.

## Options

`--since` takes a date or a word like `yesterday`. `--out` picks where the notes go, and `--dry-run` prints them instead of writing anything.
