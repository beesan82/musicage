# Bundled fonts

All fonts are licensed under the SIL Open Font License 1.1 and come from the Google Fonts repository
(https://github.com/google/fonts). Total size: about 32 MB (under the 40 MB budget).

| File | Family | Role (FontKey) | Size (bytes) | License text |
| --- | --- | --- | --- | --- |
| ShipporiMincho-Regular.ttf | Shippori Mincho | mincho | 8,677,284 | https://github.com/google/fonts/blob/main/ofl/shipporimincho/OFL.txt |
| ZenOldMincho-Regular.ttf | Zen Old Mincho | mincho-old | 5,442,512 | https://github.com/google/fonts/blob/main/ofl/zenoldmincho/OFL.txt |
| NotoSansJP-Variable.ttf | Noto Sans JP (variable, wght axis) | gothic | 9,589,900 | https://github.com/google/fonts/blob/main/ofl/notosansjp/OFL.txt |
| DelaGothicOne-Regular.ttf | Dela Gothic One | gothic-heavy | 2,508,848 | https://github.com/google/fonts/blob/main/ofl/delagothicone/OFL.txt |
| ZenMaruGothic-Regular.ttf | Zen Maru Gothic | gothic-round | 3,832,756 | https://github.com/google/fonts/blob/main/ofl/zenmarugothic/OFL.txt |
| YujiSyuku-Regular.ttf | Yuji Syuku | brush | 8,430,348 | https://github.com/google/fonts/blob/main/ofl/yujisyuku/OFL.txt |

## Notes

- Noto Sans JP ships upstream only as a variable font. It is bundled once as `NotoSansJP-Variable.ttf`
  and used for both `regular` and `bold` of `gothic`. Skia selects a weight from a variable font only
  through variation axes, which is out of scope here, so bold renders the same as regular for gothic.
- The other families have a single weight; `bold` falls back to `regular`.
