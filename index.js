import * as THREE from 'three';
import { CSS2DRenderer, GLTFLoader, OBJLoader, OrbitControls, PLYLoader, STLLoader, XYZLoader } from 'three/addons';
import GUI from 'lil-gui';


const material = new THREE.MeshPhongMaterial({
  color: 0xff0000,
  flatShading: true,
  vertexColors: true,
  wireframe: false,
  emissive: new THREE.Color(1, 1, 1),
  emissiveIntensity: 0.8,
});

const parsePLY = async (ply) => {
  ply=ply.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new PLYLoader();
  let object=loader.parse(ply);
  return new THREE.Mesh(object, material);
}

const loadPLY = async (ply) => {
  ply=ply.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new PLYLoader();
  let object=await loader.loadAsync(ply);
  return new THREE.Mesh(object, material);
}

const parseOBJ = async (obj) => {
  obj=obj.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new OBJLoader();
  let object=loader.parse(obj);
  console.log(object);
  const mesh=new THREE.Mesh(object.getAll()[0], material);
  console.log(mesh);
  return mesh
}

const loadOBJ = async (obj) => {
  obj=obj.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new OBJLoader();
  let object=await loader.loadAsync(obj);
  return new THREE.Mesh(object, material);
}

const parseGLTF = async (gltf) => {
  gltf=gltf.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new GLTFLoader();
  let object=await loader.parseAsync(gltf,"http://www.gltf.com/data/");
  console.log(object);
  const mesh=new THREE.Mesh(object, material);
  console.log(mesh);
  return mesh
}

const loadGLTF = async (gltf) => {
  gltf=gltf.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new GLTFLoader();
  let object=await loader.loadAsync(gltf);
  return new THREE.Mesh(object, material);
}

const parseSTL = async (stl) => {
  stl=stl.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new STLLoader();
  let object=loader.parse(stl);
  return new THREE.Mesh(object, material);
}

const loadSTL = async (stl) => {
  stl=stl.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new STLLoader();
  let object=await loader.loadAsync(stl);
  return new THREE.Mesh(object, material);
}

const parseURILink = async (urilink) => {
  urilink=urilink.replaceAll(/^\s+|\s+$/gu, '');
  console.log(urilink);
  if(urilink.includes(".")){
    let ext=urilink.substring(urilink.lastIndexOf(".")+1)
    console.log(ext);
    if(ext in extensions){
      let ld=extensions[ext]
      return await ld(urilink)
    }
  }
  return ""
}

const parseXYZ = async (xyz) => {
  xyz=xyz.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new XYZLoader();
  let object=loader.parse(xyz);
  const mesh=new THREE.Mesh(object, material);
  console.log(mesh);
  return mesh
}

const loadXYZ = async (xyz) => {
  xyz=xyz.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new XYZLoader();
  let object=await loader.loadAsync(xyz);
  return new THREE.Mesh(object, material);
}


const create3DObject = async (bindings, column) => (
  await Promise.all(
    bindings.map(async (item) => {
      const converter = conversions[item[column].datatype];
      return converter
        ? await converter(item[column].value)
        : null;
    },
  )))

/**
 * Map of supported RDF datatype URIs to converter functions.
 * Converter functions accept a string (literal value) and may return synchronously or return a Promise.
 * Synchronous converter example: JSON.parse (for geoJSONLiteral).
 *
 * @type {Object.<string, function(string): (Object|Promise<Object>)>}
 */
const conversions = {
  'http://www.opengis.net/ont/geosparql#gltfLiteral': parseGLTF,
  'http://www.opengis.net/ont/geosparql#objLiteral': parseOBJ,
  'http://www.opengis.net/ont/geosparql#plyLiteral': parsePLY,
  'http://www.opengis.net/ont/geosparql#stlLiteral': parseSTL,
  'http://www.opengis.net/ont/geosparql#xyzLiteral': parseXYZ,
  'http://www.w3.org/2001/XMLSchema#anyURI':parseURILink,
};

const extensions = {
  'gltf': loadGLTF,
  'obj': loadOBJ,
  'ply': loadPLY,
  'stl': loadSTL,
  'xyz': loadXYZ,
};


/**
 * GeoPlugin: YASR plugin that displays geographic results in a Leaflet map.
 *
 * @class
 */
class YasGUI3DPlugin {

  axesHelper;
  box;
  camera;
  center;
  controls;
  renderer;
  scene;
  size;

  /**
   * Create a new GeoPlugin instance.
   *
   * @param {Object} yasr - The YASR instance the plugin is attached to. Expected to expose results.json.results.bindings and resultsEl.
   */
  constructor(yasr) {
    this.yasr = yasr;
    this.priority = 30;
    this.label = '3D';
    this.geometry3DColumns = [];
    this.updateColumns();
    this.center=new THREE.Vector3();
    this.box=new THREE.Box3();
    this.size=new THREE.Vector3();
    this.scene = new THREE.Scene();
    this.renderer=null;
    this.scene=null;
    this.axesHelper = new THREE.AxesHelper( Math.max(1000, 1000, 1000) );
    this.animatefunc = () => this.animate();
  }

  clear(){
    if(this.scene!=null && this.rendere!=null){
      this.renderer.dispose()

      this.scene.traverse(object => {
        if (!object.isMesh) return

        this.deleteObject(object)
      })
    }

  }

  deleteObject(object){
    object.geometry.dispose()

    if (object.material instanceof Array) {
      object.material.forEach(material => material.dispose());
    } else {
      object.material.dispose();
    }
    object.removeFromParent()
    this.scene.remove(object)
  }

  /**
   * Update detected geometry columns based on current YASR results.
   * @returns {void}
   */
  updateColumns() {
    const bindings = this.yasr?.results?.json?.results?.bindings ?? [];
    const firstRow = bindings[0] ?? {};

    this.geometry3DColumns = Object.keys(firstRow)
      .filter(
        (k) =>
          firstRow[k].datatype &&
          Object.keys(conversions).includes(firstRow[k].datatype),
      )
      .map((colName) => ({ colName, datatype: firstRow[colName].datatype }));
  }

  /**
   * Called by YASR to render the visualization.
   * @returns {Promise<void>}
   */
  async draw() {
    this.updateColumns();
    await this.update3DView();
  }




  fitCameraToSelection(camera, controls, selection, fitOffset = 1.5) {
    this.box.makeEmpty();
    for(const object of selection) {
      this.box.expandByObject(object);
    }

    this.box.getSize(this.size);
    this.box.getCenter(this.center);

    const maxSize = Math.max(this.size.x, this.size.y, this.size.z);
    const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * this.camera.fov / 360));
    const fitWidthDistance = fitHeightDistance / this.camera.aspect;
    const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

    const direction = this.controls.target.clone()
      .sub(this.camera.position)
      .normalize()
      .multiplyScalar(distance);

    this.controls.maxDistance = distance * 100;
    this.controls.target.copy(this.center);

    this.camera.near = distance / 100;
    this.camera.far = distance * 250;
    this.camera.updateProjectionMatrix();

    this.camera.position.copy(this.controls.target).sub(direction);

    //this.controls.update();
  };


  async initThreeJS(domelement, verts, meshurls) {
    let loader;
    let minz = Number.MAX_VALUE
    let maxz = Number.MIN_VALUE
    let miny = Number.MAX_VALUE
    let maxy = Number.MIN_VALUE
    let minx = Number.MAX_VALUE
    let maxx = Number.MIN_VALUE
    let vertarray = []
    let annotations = new THREE.Group();
    const objects = new THREE.Group();
    this.clear();
    document.getElementById(domelement).innerHTML = '';
    document.getElementById("threejsnav").innerHTML = '';
    this.scene = new THREE.Scene();
    console.log(verts)
    const svgShape = new THREE.Shape();
    let first = true
    let height = 600
    let width = 800
    const gui = new GUI({ autoPlace: false })
    gui.domElement.id = "gui"
    document.getElementById("threejsnav").appendChild(gui.domElement)
    const geometryFolder = gui.addFolder("Mesh");
    geometryFolder.open();
    const lightingFolder = geometryFolder.addFolder("Lighting");
    const geometryF = geometryFolder.addFolder("Geometry");
    geometryF.open();
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);
    document.getElementById(domelement).appendChild(this.renderer.domElement);
    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(window.innerWidth, window.innerHeight)
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.top = '0px'
    labelRenderer.domElement.style.pointerEvents = 'none'
    document.body.appendChild(labelRenderer.domElement)
    let bbox = null
    this.camera = new THREE.PerspectiveCamera(90, width / height, 0.1, 2000);
    //this.scene.add(new THREE.AmbientLight(0x222222));
    this.light = new THREE.DirectionalLight(0xffffff, 1);
    this.light.position.set(20, 20, 0);
    this.scene.add(this.light);
    lightingFolder.add(this.light.position, "x").min(-5).max(5).step(0.01).name("X Position")
    lightingFolder.add(this.light.position, "y").min(-5).max(5).step(0.01).name("Y Position")
    lightingFolder.add(this.light.position, "z").min(-5).max(5).step(0.01).name("Z Position")
    const color = 0x404040;
    const intensity = 1;
    this.thelight = new THREE.AmbientLight(color, intensity);
    this.scene.add(this.thelight);
    this.scene.add(this.axesHelper);
    console.log("Depth: " + (maxz - minz))
    this.scene.add(annotations);
    let centervec = new THREE.Vector3()
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    //controls.target.set( centervec.x,centervec.y,centervec.z );
    this.controls.target.set(0, 0, 0);
    this.camera.position.x = 0
    this.camera.position.y = 0
    this.camera.position.z = 150;
    this.controls.maxDistance = Math.max(1000, 1000, 1000)
    this.controls.update();
    this.controls.addEventListener( 'change', this.renderer );
    const updateCamera = () => {
      this.camera.updateProjectionMatrix();
    }
    const cameraFolder = geometryFolder.addFolder("Camera");
    cameraFolder.add(this.camera, 'fov', 1, 180).name('Zoom').onChange(updateCamera);
    cameraFolder.add(this.camera.position, 'x').min(-500).max(500).step(5).name("X Position").onChange(updateCamera);
    cameraFolder.add(this.camera.position, 'y').min(-500).max(500).step(5).name("Y Position").onChange(updateCamera);
    cameraFolder.add(this.camera.position, 'z').min(-500).max(500).step(5).name("Z Position").onChange(updateCamera);
    //gui.add(annotations, 'visible').name('Annotations')
    for (const object3DColumn of this.geometry3DColumns) {
      const colName = object3DColumn.colName;
      const object3d = await create3DObject(
        this.yasr.results.json.results.bindings,
        colName,
      );
      console.log(object3d)
      objects.add(object3d[0]);
      this.addRotationControls(object3d,geometryF,objects,this.scene)
    }
    console.log(objects);
    this.scene.add(objects);
    gui.add(objects, 'visible').name('Meshes')
    gui.add(this.axesHelper, 'visible').name('Axis Helper')
    this.fitCameraToSelection(this.camera, this.controls, objects.children)
    this.animate()
  }

  animate() {
    requestAnimationFrame( this.animatefunc );
    //console.log(this.controls);
    //console.log(this.renderer);
    //console.log(this.scene);
    //console.log(this.camera);
    //this.controls.update();
    this.renderer.render( this.scene, this.camera );
  }

  addRotationControls(box,geometryF,objects,scene){
    geometryF.close();
    let yourVar=null;
    const rotationFolder = geometryF.addFolder("Rotation");
    rotationFolder.add(objects.rotation, 'x', 0, Math.PI).name("X").onChange(
      function(){
        yourVar = this.getValue();
        scene.traverse(function(obj){
          if(obj.type === 'Mesh'){
            obj.rotation.x = yourVar;
          }});
      });
    rotationFolder.add(objects.rotation, 'y', 0, Math.PI).name("Y").onChange(
      function(){
        yourVar = this.getValue();
        scene.traverse(function(obj){
          if(obj.type === 'Mesh'){
            obj.rotation.y = yourVar;
          }});
      });
    rotationFolder.add(objects.rotation, 'z', 0, Math.PI).name("Z").onChange(
      function(){
        yourVar = this.getValue();
        scene.traverse(function(obj){
          if(obj.type === 'Mesh'){
            obj.rotation.z = yourVar;
          }});
      });

    const scaleFolder = geometryF.addFolder("Scale");
    scaleFolder.add(objects.scale, 'x', 0, 2).name("X").onChange(
      function(){
        yourVar = this.getValue();
        scene.traverse(function(obj){
          if(obj.type === 'Mesh'){
            obj.scale.x = yourVar;
          }});
      });
    scaleFolder.add(objects.scale, 'y', 0, 2).name("Y").onChange(
      function(){
        yourVar = this.getValue();
        scene.traverse(function(obj){
          if(obj.type === 'Mesh'){
            obj.scale.y = yourVar;
          }});
      });
    scaleFolder.add(objects.scale, 'z', 0, 2).name("Z").onChange(
      function(){
        yourVar = this.getValue();
        scene.traverse(function(obj){
          if(obj.type === 'Mesh'){
            obj.scale.z = yourVar;
          }});
      });
  }

  /**
   * Build or update the Leaflet map with the current results.
   * @returns {Promise<void>}
   */
  async update3DView() {
    if (!this.container) {
      this.wrapper=document.createElement('div');
      this.wrapper.setAttribute('id', 'wrapper');
      this.wrapper.style="display: flex";
      this.container = document.createElement('div');
      this.container.style.height = '100%';
      this.container.style.minHeight = '500px';
      this.container.style.width = '100%';
      this.container.id="threejs";
      this.container.className="threejscontainer";
      this.wrapper.appendChild(this.container);
      this.navcontainer=document.createElement("div");
      this.navcontainer.id ="threejsnav";
      this.navcontainer.style="flex:1;"
      this.wrapper.appendChild(this.navcontainer);
    }
    this.yasr.resultsEl.appendChild(this.wrapper);
    await this.initThreeJS("threejs")
    }


  /**
   * Return an element used as a icon for the plugin.
   * @returns {HTMLElement}
   */
  getIcon() {
    const icon = document.createElement('div');
    icon.innerHTML = '🌍';
    return icon;
  }

  /**
   * Check whether current results contain supported geometry columns.
   * @returns {boolean}
   */
  canHandleResults() {
    this.updateColumns();
    return this.geometry3DColumns && this.geometry3DColumns.length > 0;
  }
}

export default YasGUI3DPlugin;
