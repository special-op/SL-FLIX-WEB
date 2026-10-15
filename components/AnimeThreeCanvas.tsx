import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface AnimeThreeCanvasProps {
  className?: string;
  variant?: 'cyber' | 'sakura' | 'energy';
}

export const AnimeThreeCanvas: React.FC<AnimeThreeCanvasProps> = ({ 
  className = "w-full h-full absolute inset-0 pointer-events-none",
  variant = 'cyber'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || 300;
    let height = container.clientHeight || 200;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 30;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Particle field
    const particleCount = 280;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const color1 = new THREE.Color(variant === 'sakura' ? 0xff4081 : 0x00e5ff); // pink or neon cyan
    const color2 = new THREE.Color(variant === 'energy' ? 0xff9100 : 0x7c4dff); // orange or neon purple

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const radius = 10 + Math.random() * 25;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;

      positions[i3] = radius * Math.sin(theta) * Math.cos(phi);
      positions[i3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      positions[i3 + 2] = radius * Math.cos(theta);

      const mixed = color1.clone().lerp(color2, Math.random());
      colors[i3] = mixed.r;
      colors[i3 + 1] = mixed.g;
      colors[i3 + 2] = mixed.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Dynamic Central Anime Energy Ring
    const ringGeo = new THREE.TorusGeometry(8, 0.18, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({
      color: variant === 'sakura' ? 0xff4081 : 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    scene.add(ring);

    const ringGeo2 = new THREE.TorusGeometry(12, 0.1, 16, 100);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x7c4dff,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending
    });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.x = Math.PI / 3;
    scene.add(ring2);

    let mouseX = 0;
    let mouseY = 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let isPageVisible = document.visibilityState === 'visible';
    let animationFrameId: number | null = null;
    let clock = new THREE.Clock();
    const onMouseMove = (e: MouseEvent) => {
      const windowHalfX = window.innerWidth / 2;
      const windowHalfY = window.innerHeight / 2;
      mouseX = (e.clientX - windowHalfX) * 0.0005;
      mouseY = (e.clientY - windowHalfY) * 0.0005;
    };
    window.addEventListener('mousemove', onMouseMove);

    const renderFrame = (elapsedTime: number) => {
      particles.rotation.y = elapsedTime * 0.08 + mouseX;
      particles.rotation.x = elapsedTime * 0.04 + mouseY;
      ring.rotation.x = elapsedTime * 0.2;
      ring.rotation.y = elapsedTime * 0.3;
      ring.scale.setScalar(1 + Math.sin(elapsedTime * 1.5) * 0.05);
      ring2.rotation.x = -elapsedTime * 0.15;
      ring2.rotation.z = elapsedTime * 0.25;
      renderer.render(scene, camera);
    };

    const animate = () => {
      if (!isPageVisible) return;
      renderFrame(prefersReducedMotion.matches ? 0 : clock.getElapsedTime());
      if (!prefersReducedMotion.matches) animationFrameId = requestAnimationFrame(animate);
    };

    animate();
    const handleVisibilityChange = () => {
      isPageVisible = document.visibilityState === 'visible';
      if (!isPageVisible && animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      } else if (isPageVisible && !prefersReducedMotion.matches) {
        clock = new THREE.Clock();
        animate();
      } else if (isPageVisible) renderFrame(0);
    };
    const handleMotionPreference = () => {
      if (prefersReducedMotion.matches) {
        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        renderFrame(0);
      } else if (isPageVisible && animationFrameId === null) {
        clock = new THREE.Clock();
        animate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    prefersReducedMotion.addEventListener?.('change', handleMotionPreference);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0) {
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();
          renderer.setSize(newW, newH);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      prefersReducedMotion.removeEventListener?.('change', handleMotionPreference);
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      ringGeo2.dispose();
      ringMat2.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [variant]);

  return <div ref={containerRef} className={className} />;
};

export default AnimeThreeCanvas;
