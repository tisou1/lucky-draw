import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { ActivitySettings, DrawPhase, Participant } from '@/domain/types'
import { ATLAS_COLUMNS, buildAtlas, TILE_HEIGHT, TILE_WIDTH } from './atlas'

interface Props {
  participants: Participant[]
  layout: ActivitySettings['layout']
  quality: ActivitySettings['quality']
  phase: DrawPhase
  reduced: boolean
  visible: boolean
  onFailure: () => void
}

const vertexShader = `
  attribute vec4 atlasRect;
  varying vec2 vUv;
  varying float vOpacity;
  void main() {
    vUv = atlasRect.xy + uv * atlasRect.zw;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vOpacity = clamp(1.1 - (-mv.z - 5.0) * 0.08, 0.35, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`
const fragmentShader = `
  uniform sampler2D atlas;
  varying vec2 vUv;
  varying float vOpacity;
  void main() {
    vec4 color = texture2D(atlas, vUv);
    gl_FragColor = vec4(color.rgb, color.a * vOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Cards({ participants, layout, phase, reduced, onFailure }: Omit<Props, 'quality' | 'visible'>) {
  const [atlas, setAtlas] = useState<{ key: string; texture: THREE.CanvasTexture } | null>(null)
  const mesh = useRef<THREE.InstancedMesh>(null)
  const angle = useRef(0)
  const speed = useRef(0.08)
  const { camera } = useThree()
  const key = participants.map(p => `${p.id}:${p.name}:${p.department}:${p.code}:${p.avatarId ?? ''}`).join('|')
  useEffect(() => {
    const abort = new AbortController()
    let owned: THREE.CanvasTexture | undefined
    void buildAtlas(participants, abort.signal).then(texture => {
      owned = texture
      if (abort.signal.aborted) texture.dispose()
      else setAtlas({ key, texture })
    }).catch(() => { if (!abort.signal.aborted) onFailure() })
    return () => { abort.abort(); owned?.dispose() }
  }, [participants, key, onFailure])

  const positions = useMemo(() => participants.map((_, i) => {
    const ratio = participants.length > 1 ? i / (participants.length - 1) : 0.5
    if (layout === 'helix') {
      const theta = i * 0.32 + (i % 2) * Math.PI
      return new THREE.Vector3(Math.cos(theta) * 1.7, (ratio - 0.5) * 5.2, Math.sin(theta) * 1.7)
    }
    const y = 1 - 2 * ratio
    const radius = Math.sqrt(1 - y * y)
    const theta = Math.PI * (3 - Math.sqrt(5)) * i
    return new THREE.Vector3(Math.cos(theta) * radius * 2.4, y * 2.4, Math.sin(theta) * radius * 2.4)
  }), [participants, layout])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const axis = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  const resources = useMemo(() => {
    if (!atlas || atlas.key !== key) return null
    const geometry = new THREE.PlaneGeometry(0.46, 0.58)
    const image = atlas.texture.image as HTMLCanvasElement
    const rects = new Float32Array(participants.length * 4)
    participants.forEach((_, i) => rects.set([
      (i % ATLAS_COLUMNS) * TILE_WIDTH / image.width,
      1 - (Math.floor(i / ATLAS_COLUMNS) + 1) * TILE_HEIGHT / image.height,
      TILE_WIDTH / image.width, TILE_HEIGHT / image.height,
    ], i * 4))
    geometry.setAttribute('atlasRect', new THREE.InstancedBufferAttribute(rects, 4))
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { atlas: { value: atlas.texture } }, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    return { geometry, material }
  }, [atlas, key, participants])
  useEffect(() => () => { resources?.geometry.dispose(); resources?.material.dispose() }, [resources])

  useFrame((_, rawDelta) => {
    if (!mesh.current) return
    const delta = Math.min(rawDelta, 0.05)
    const target = reduced ? 0 : phase === 'rolling' ? 2.5 : phase === 'revealing' || phase === 'saving' ? 0 : 0.08
    speed.current = THREE.MathUtils.damp(speed.current, target, phase === 'rolling' ? 3 : 5, delta)
    angle.current += speed.current * delta
    for (let i = 0; i < positions.length; i++) {
      dummy.position.copy(positions[i]).applyAxisAngle(axis, angle.current)
      dummy.quaternion.copy(camera.quaternion)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  if (!resources) return null
  return <instancedMesh ref={mesh} args={[resources.geometry, resources.material, participants.length]} frustumCulled={false} dispose={null} />
}

function Environment({ quality, reduced, onFailure }: Pick<Props, 'quality' | 'reduced' | 'onFailure'>) {
  const orbit = useRef<THREE.Group>(null)
  const { gl, camera, size } = useThree()
  useEffect(() => {
    camera.position.set(0, 0.1, Math.max(9, 7.2 / (size.width / size.height)))
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onFailure() }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl, onFailure])
  useFrame((_, delta) => { if (orbit.current && !reduced) orbit.current.rotation.y += Math.min(delta, 0.05) * 0.03 })
  return <>
    <Sparkles count={quality === 'low' ? 32 : 96} scale={[9, 7, 7]} size={1.4} speed={reduced ? 0 : 0.12} opacity={0.22} color="#e2e1db" />
    <group ref={orbit}>
      <mesh rotation={[1.13, 0.18, 0.35]}><torusGeometry args={[3.0, 0.006, 3, 160]} /><meshBasicMaterial color="#cfcec7" transparent opacity={0.16} /></mesh>
    </group>
  </>
}

export default function Scene3D(props: Props) {
  return <Canvas dpr={props.quality === 'low' ? 1 : [1, 1.5]} camera={{ fov: 42, position: [0, 0, 10], near: 0.1, far: 35 }} frameloop={!props.visible ? 'never' : props.reduced ? 'demand' : 'always'} gl={{ antialias: props.quality !== 'low', alpha: true, powerPreference: props.quality === 'low' ? 'low-power' : 'default' }}>
    <Environment quality={props.quality} reduced={props.reduced} onFailure={props.onFailure} />
    <Cards participants={props.participants} layout={props.layout} phase={props.phase} reduced={props.reduced} onFailure={props.onFailure} />
  </Canvas>
}
