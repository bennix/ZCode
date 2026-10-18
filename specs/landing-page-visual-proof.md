# Landing Page visual proof and automation disclosure

## Product rules

- Keep the current bilingual 3.14.35 Landing Page as the source of truth; do not replace it with the stale 3.14.26 page in older checkouts.
- The public page is https://bennix.github.io/ZenMuxDev/, published from `bennix/ZenMuxDev` branch `cursor/zenmux-zencode-provider`. Version labels and installer links use GitHub release `v3.14.35`: the notarized macOS Apple Silicon DMG, Windows x64/ARM64 installers, and Linux x64/ARM64 DEB and RPM. Keep the published page's macOS featured download treatment and the existing ZenMux referral disclosure.
- The first viewport must show a real, information-rich ZenCode product screen. Use the supplied automation workflow screenshot as the hero because its useful UI is legible in a narrow viewport; constrain the hero image height on phones so it does not dominate the first screen. Keep the IDE + AI composer, command palette, and automation screenshots in the gallery with full-size accessible previews. Do not fabricate or edit screenshot contents.
- Keep all three supplied screenshots in the feature gallery, use specific captions, and let visitors open the full image in an accessible dialog. The dialog is transient UI state owned by `index.html`; it closes with its close control, Escape, or a backdrop click, and browser focus returns to the invoking image button.
- The feature heading and lead paragraph must retain normal document flow with no overlap at desktop and mobile widths. Reveal/scroll effects must not leave section content hidden when animation is skipped or unsupported.
- Add a comparison row for scheduled and background automation. State that the desktop app must remain running and the computer awake for a scheduled trigger; missed windows are not guaranteed to replay. The “Keep computer running” option prevents idle sleep while a session is running but does not prevent lid-close or manual sleep.
- Keep all new copy and image labels complete in Chinese and English.
- Include the supplied Huashu Art Motion screen recording as an opt-in inline video demo after the product screenshot gallery. Use a representative frame as the poster, keep controls available, do not autoplay, and encode for web delivery with no silent audio track. Caption the clip accurately as a real workflow that prompts a 10-second Van Gogh-inspired animated cat; preserve the original clip content.
- Include a curated excerpt of the supplied WeChat recording that shows the user sending an `/image` request and receiving generated images. Exclude the earlier quota failure and request ID from the public clip; use a poster from the successful result, retain the near-square aspect ratio, and provide localized accessible labels. Do not autoplay.
- The hero stage directly under the automation screenshot is the code-built product introduction `media/zencode-product-intro.mp4` (1920×1080, 60 fps, 22.000 seconds). It is an illustration reconstructed from documented product behavior, not a screen recording. Playback is opt-in: `controls`, `playsinline`, `preload="none"`, no autoplay. The poster is `media/zencode-product-intro-poster.jpg`, the finished first frame. Caption and note stay bilingual and say that on-screen words are limited to documented behavior, and that this cut does not demonstrate native Computer Use or model dispatch. Do not replace the hero still with this video. Keep `ZenCode-Promo.mp4` in the repo, but do not present it as the current introduction.

## State ownership and interaction order

```text
gallery image button → index.html dialog state → full-size image + caption
close / Escape / backdrop → dialog closes → focus returns to invoking button
locale switch → translated visible copy, alt/accessible labels, and dialog caption
```

The desktop Scheduler is hosted by the running Electron app. It polls due automation and routes runs to a local Host. If the app is not running or the computer is asleep, the scheduler cannot dispatch at the scheduled time; automation runs missed beyond the grace window are skipped/rescheduled according to their schedule rule. The keep-awake preference is implemented by Electron `powerSaveBlocker("prevent-app-suspension")` during active session execution and cannot prevent lid-close or manual sleep.

## Acceptance

- In the 3.14.35 Chinese/English page, the hero shows the supplied automation workflow image and its caption describes the pictured automation controls accurately; at a 390px viewport its image height is constrained and does not create a long full-screen hero.
- Every visible version label and installer link on the published page resolves to a `v3.14.35` asset, including the hero macOS download and the Windows and Linux package links.
- Clicking each of the three gallery screenshots opens a legible full-size image; closing by button, Escape, and backdrop works, keyboard focus is restored, and mobile viewport does not overflow horizontally.
- The product capabilities heading and its description remain readable after scrolling into view at desktop and phone widths; reduced-motion or skipped animation cannot hide content.
- The workflow comparison includes scheduled/background automation, and the desktop-running, awake-computer, missed-window, and keep-awake limitations are stated clearly in Chinese and English.
- Language switching updates the new text, image alternatives, accessible labels, and any open dialog caption.
- The Huashu Art Motion demo plays from an inline player at desktop and mobile widths, remains within the content column, and does not load video data beyond metadata before the visitor starts playback.
- The WeChat demo shows the real message and returned image without exposing the quota error/request ID; its near-square player preserves the original aspect ratio and remains within the content column at desktop and mobile widths.
- The hero product introduction plays only after the visitor starts it, shows the reconstructed 22-second film with its poster, and its Chinese and English caption and note describe it as an illustration rather than a screen recording.
