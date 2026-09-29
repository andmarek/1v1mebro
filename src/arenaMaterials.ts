import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
// Register the environment decoder with the same shader store as the prebundled engine.
import '@babylonjs/core/Shaders/rgbdDecode.fragment';
import '@babylonjs/core/Shaders/postprocess.vertex';
import '@babylonjs/core/Shaders/pbr.vertex';
import '@babylonjs/core/Shaders/pbr.fragment';

export function arenaMaterials(scene: Scene) {
  const environment = CubeTexture.CreateFromPrefilteredData('/assets/rifle-lighting.env', scene);
  environment.rotationY = 1.1;
  function plain(name: string, color: string, metallic = 0, roughness = 0.85) {
    const m = new PBRMaterial(name, scene);
    m.albedoColor = Color3.FromHexString(color); m.metallic = metallic; m.roughness = roughness;
    m.reflectionTexture = environment; m.environmentIntensity = 0.45;
    return m;
  }
  function scanned(name: string, asset: string, color: string, metallic = 0) {
    const m = plain(name, color, metallic, 1);
    m.albedoTexture = new Texture(`/assets/map/${asset}-color.jpg`, scene);
    m.bumpTexture = new Texture(`/assets/map/${asset}-normal.jpg`, scene);
    m.bumpTexture.level = asset === 'sand' ? 0.55 : 0.35;
    m.invertNormalMapY = true;
    m.metallicTexture = new Texture(`/assets/map/${asset}-rough.jpg`, scene);
    m.metallicTexture.gammaSpace = false;
    m.useRoughnessFromMetallicTextureAlpha = false; m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = false;
    return m;
  }
  const sand = scanned('tracked desert sand', 'sand', '#e1c6a0');
  for (const texture of [sand.albedoTexture, sand.bumpTexture, sand.metallicTexture]) {
    const t = texture as Texture; t.uScale = t.vScale = 220 / 15;
  }
  const concrete = scanned('stained cast concrete', 'concrete', '#bcb3a0');
  const rust = scanned('flaking oxidized steel', 'metal', '#c9a28b', 0.25);
  const steel = scanned('weathered structural steel', 'metal', '#697572', 0.65);
  function paint(name: string, color: string) {
    const m = plain(name, '#ffffff', 0.35, 0.8);
    const texture = new DynamicTexture(`${name} chips`, 512, scene, true);
    const c = texture.getContext() as CanvasRenderingContext2D;
    c.fillStyle = color; c.fillRect(0, 0, 512, 512);
    let seed = 839;
    const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    // Fine oxidation, irregular paint chips, and vertical rain streaks.
    for (let i = 0; i < 3500; i++) {
      c.fillStyle = i % 3 === 0 ? 'rgba(55,40,28,.38)' : 'rgba(216,207,180,.16)';
      const x = random() * 512, y = random() * 512, size = 0.3 + random() * 2.7;
      c.fillRect(x, y, size, size * random() * 3);
    }
    for (let i = 0; i < 35; i++) {
      c.fillStyle = 'rgba(39,32,24,.08)'; c.fillRect(random() * 512, random() * 320, 1 + random() * 4, 40 + random() * 150);
    }
    texture.update(); m.albedoTexture = texture;
    m.bumpTexture = rust.bumpTexture; m.metallicTexture = rust.metallicTexture;
    m.invertNormalMapY = true; m.useRoughnessFromMetallicTextureAlpha = false;
    m.useRoughnessFromMetallicTextureGreen = true; m.useMetallnessFromMetallicTextureBlue = false;
    return m;
  }
  return { sand, concrete, steel, rust, teal: paint('faded blue paint', '#526f72'), ochre: paint('sun bleached industrial yellow', '#ac8b4d'),
    pale: paint('worn ivory paint', '#c2bdab'), black: plain('aged rubber', '#222521', 0, 0.95),
    orange: paint('faded safety orange', '#be7443'), targetPlate: paint('range target enamel', '#738981'),
    targetHead: paint('head plate enamel', '#bd9c67') };
}
