# PROJECT SPLASH Generated Assets

모든 자산은 Codex 내장 `imagegen` 모드로 생성했으며, 프로젝트 전용 원본 디자인입니다.

## `ripple-player.png`

```text
Use case: stylized-concept
Asset type: 3D web arena game character sprite / camera-facing billboard
Primary request: one original PROJECT SPLASH player creature, a tiny athletic soft sci-fi lifeform called a Ripple, designed for a playful competitive arena
Subject: single full-body creature only; rounded oversized head, compact pear-shaped body, short springy legs, mitten-like hands, two small flexible antenna fins, luminous cyan face visor with two simple expressive eyes, indigo body suit with aqua energy seams, small coral team scarf; friendly but determined
Style/medium: polished stylized 3D toy render, soft geometry, strong readable silhouette, low material complexity, premium modern multiplayer game art, not pixel art
Composition/framing: centered full body, front three-quarter neutral action-ready pose, entire feet and antennae visible, generous clean padding, readable when rendered at small gameplay scale
Lighting/mood: bright soft studio game lighting, subtle cool rim light
Color palette: deep indigo, electric aqua, white highlights, tiny coral accent
Materials/textures: matte soft-touch vinyl, translucent glowing visor, restrained glossy details
Constraints: genuinely transparent background with clean alpha; exactly one character; no ground plane; no cast shadow; no text; no logo; no watermark; no weapon; no frame; no sprite sheet; no copied or recognizable franchise character
Avoid: photorealism, realistic human proportions, excessive surface detail, thin limbs, dark silhouette
```

## `ripple-rival.png`

```text
Use case: style-transfer
Asset type: 3D web arena game rival bot sprite / camera-facing billboard
Primary request: create one rival-team variant of the PROJECT SPLASH Ripple character from Image 1
Input images: Image 1 is the exact character design and style reference; preserve the species, toy-render quality, anatomy, antenna shape, full-body framing, and material language
Subject: single full-body rival creature only; saturated coral-orange body suit, warm magenta energy seams, cream highlights, and a small teal team scarf; playful competitive smirk; neutral action-ready pose
Style/medium: polished stylized 3D toy render, soft geometry, strong readable silhouette, low material complexity
Constraints: genuinely transparent background with clean alpha; exactly one character; no ground plane; no cast shadow; no text; no logo; no watermark; no weapon; no frame; no sprite sheet
```

The first rival output rendered a checkerboard into the pixels. A second `background-extraction` edit removed only that background and preserved the character.

## `playroom-key-art.png`

```text
Use case: stylized-concept
Asset type: PROJECT SPLASH game lobby key art / wide hero background
Primary request: an original energetic 3D game key art scene for a playful competitive arena called PROJECT SPLASH, showing tiny soft sci-fi creatures causing a chain reaction with glowing Splash Cores inside a gigantic child's playroom
Scene/backdrop: oversized bedroom playroom arena made from stacked books, chunky wooden blocks, a desk edge, toy track, paper ramps, plastic tubes and a large desk fan; no recognizable branded toys
Subject: three tiny rounded antenna creatures in indigo-cyan, coral-magenta, and lime-yellow team colors; one throws a glowing spherical energy core, another dashes away, and a third braces against a sweeping aqua-coral chain explosion; multiple glowing cores create clear cross-shaped energy paths across the arena
Style/medium: premium stylized 3D game key art, toy-like soft geometry, strong silhouettes, low material complexity, expressive motion, original visual language, no photorealism
Composition/framing: cinematic 16:9 wide view from a high quarter angle; central chain-reaction focal point; clean darker negative space along the upper-left area for DOM title copy; keep important action inside safe crop margins
Lighting/mood: bright dramatic late-afternoon room light mixed with vivid aqua, violet, coral, and warm gold energy glow; thrilling, playful chaos, readable not cluttered
Constraints: no text, no title, no logo, no watermark, no UI frame, no guns, no realistic children, no copied or recognizable franchise designs
```

## 저장 위치

- `assets/source/splash/ripple-player.png`
- `assets/source/splash/ripple-rival.png`
- `assets/source/splash/playroom-key-art.png`

웹 런타임은 원본을 보존한 채 다음 최적화 파생본을 사용합니다.

- `ripple-player-web.png` — 600×657, alpha 유지
- `ripple-rival-web.png` — 600×657, alpha 유지
- `playroom-key-art-web.jpg` — JPEG quality 88

## Key-art anchored character set v2

아래 자산은 사용자 선택 키 아트 `project-splash-key-art-reference-v2.png`을 단일 스타일 레퍼런스로 사용해 Codex 내장 `imagegen` 모드로 생성했습니다.

### `ripple-blue-keyart-v2-transparent.png`

```text
Use case: stylized-concept
Asset type: PROJECT SPLASH Three.js character billboard sprite
Primary request: create one clean full-body blue player character that exactly follows the character visual language shown in Image 1
Input images: Image 1 is the sole style and character-proportion reference; use the blue character on the left as the primary design reference
Subject: one small toy-like arena creature with a round capsule/bean body, tiny integrated legs, short arms, cyan hands and feet, a white oval face panel with exactly two glossy black oval eyes and no mouth, two blue antennae ending in glowing cyan bulbs, one cyan belly ring
Style/medium: polished stylized 3D game render matching Image 1; soft geometry, simple premium toy design, low material complexity
Constraints: genuinely transparent background; exactly one character; no scenery, shadow, text, clothing, armor or human anatomy
```

### `ripple-red-keyart-v2-transparent.png`

```text
Use case: stylized-concept
Asset type: PROJECT SPLASH Three.js rival character billboard sprite
Primary request: create one clean full-body coral-red rival character that exactly follows the character visual language shown in Image 1
Input images: Image 1 is the sole style and proportion reference; use the red character near the desk fan
Subject: round capsule/bean body, tiny legs, short arms, burgundy hands and feet, pale face panel with two dark oval eyes and no mouth, short coral antennae with curled loop tips, dark teal belly ring
Style/medium: polished stylized 3D game render matching Image 1; soft premium toy design
Constraints: genuinely transparent background; exactly one character; no scenery, shadow, text, clothing, armor or human anatomy
```

### `ripple-yellow-keyart-v2-transparent.png`

```text
Use case: stylized-concept
Asset type: PROJECT SPLASH Three.js yellow team character billboard sprite
Primary request: create one clean full-body yellow-lime team character matching the lower-right character in Image 1
Subject: round capsule/bean body, lime hands and feet, pale face panel with two black oval eyes and no mouth, lime antennae with glowing yellow bulbs, teal ear discs and belly ring
Style/medium: polished stylized 3D game render matching Image 1; soft premium toy design
Constraints: genuinely transparent background; exactly one character; no scenery, shadow, text, clothing, armor or human anatomy
```

파랑과 빨강의 첫 출력에는 체크무늬가 실제 픽셀로 포함되어 `background-extraction` 편집으로 배경만 제거했습니다. 최종 파일은 `Format32bppArgb`, 모서리 alpha `0`으로 검증했습니다.

웹 런타임은 다음 최적화 파생본을 사용합니다.

- `ripple-blue-keyart-v2-web.png` — 600×600
- `ripple-red-keyart-v2-web.png` — 600×600
- `ripple-yellow-keyart-v2-web.png` — 575×600
- `project-splash-key-art-v2-web.jpg` — JPEG quality 88

### `ripple-vio-keyart-v1-transparent.png`

Codex 내장 `imagegen`으로 생성한 네 번째 2v2 캐릭터입니다.

```text
Use case: stylized-concept
Asset type: transparent-background character game sprite for PROJECT SPLASH
Primary request: Create a fourth playable alien named VIO, matching the exact visual language of the supplied PROJECT SPLASH key art: tiny round capsule body, oversized smooth white face panel, two simple glossy black oval eyes, two flexible antennae with glowing bulb tips, mitten hands and tiny boots. VIO's body is rich violet-purple with magenta accents and a small cyan energy ring on the belly. Give VIO a lively evasive runner pose, leaning sideways as if dodging an energy blast, readable at small HUD size.
Input image: the supplied PROJECT SPLASH key art is a style and character-family reference only.
Scene/backdrop: genuinely transparent background, isolated full body, no floor, no shadow box, no environment.
Style/medium: polished stylized 3D game character render, toy-like soft geometry, matte vinyl material, low surface complexity, strong silhouette.
Composition/framing: centered full body, all antennae and limbs visible, generous transparent padding, square image.
Lighting/mood: warm soft key light with cool cyan rim light; friendly competitive energy.
Color palette: violet, magenta, cyan glow, white face, black eyes.
Constraints: must clearly belong to the same original PROJECT SPLASH species as BLOO/CORAL/LUMI; actual alpha transparency; no text, logo, UI, watermark, weapon, human features, scenery, pedestal, or cropped parts.
```

- 원본: `assets/source/splash/ripple-vio-keyart-v1-transparent.png` — 1024×1024, alpha 유지
- 웹 런타임: `public/assets/splash/ripple-vio-keyart-v1-web.webp` — 640×640, 51 KB, alpha 유지
