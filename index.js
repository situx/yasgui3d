import 'leaflet/dist/leaflet.css';
import * as THREE from 'three';
import renderer from 'three/src/renderers/common/Renderer.js';
import scene from 'three/addons/offscreen/scene.js';
import { GLTFLoader, OBJLoader, OrbitControls, PLYLoader } from 'three/addons';

const material = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  flatShading: true,
  vertexColors: THREE.VertexColors,
  wireframe: false
});

const parsePLY = async (ply) => {
  ply=ply.replaceAll(/^\s+|\s+$/gu, '');
  let loader = new PLYLoader();
  let object=loader.parse(ply);
  const mesh = new THREE.Mesh(object, material);
  objects.add(mesh);
  scene.add(objects);
  addRotationControls(object,geometryF,objects)
  if(objects.children.length>0){
    camera.lookAt( objects.children[0].position );
  }
  fitCameraToSelection(camera, controls, objects.children)
}

/**
 * Map of supported RDF datatype URIs to converter functions.
 * Converter functions accept a string (literal value) and may return synchronously or return a Promise.
 * Synchronous converter example: JSON.parse (for geoJSONLiteral).
 *
 * @type {Object.<string, function(string): (Object|Promise<Object>)>}
 */
const conversions = {
  'http://www.opengis.net/ont/geosparql#plyLiteral': parsePLY
};

/**
 * Creates a GeoJSON object from SPARQL query bindings.
 *
 * @param {Array} bindings - An array of binding objects from a SPARQL query result.
 * @param {string} wktColumn - The key in the binding objects that contains the WKT (Well-Known Text) geometry.
 * @returns {Object} A GeoJSON object representing the features.
 */
const createThreeJSView = async (bindings, column) => ({
  type: 'FeatureCollection',
  features: await Promise.all(
    bindings.map(async (item) => {
      const converter = conversions[item[column].datatype];
      const geometry = converter
        ? await converter(item[column].value)
        : null ;
      return {
        type: 'Feature',
        properties: item,
        geometry,
      };
    }),
  ),
});

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
    this.axesHelper = new THREE.AxesHelper( Math.max(1000, 1000, 1000) );
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
    await this.updateMap();
  }


  prepareAnnotationFromJSON(verts,annotations){
    const svgShape = new THREE.Shape();
    let first=true
    for(vert of verts){
      if(first){
        svgShape.moveTo(vert["x"], vert["y"]);
        first=false
      }else{
        svgShape.lineTo(vert["x"], vert["y"]);
      }
      vertarray.push(vert["x"])
      vertarray.push(vert["y"])
      vertarray.push(vert["z"])
      let minz,maxz,minx,maxx,miny,maxy;
      if(vert["z"]>maxz){
        maxz=vert["z"]
      }
      if(vert["z"]<minz){
        minz=vert["z"]
      }
      if(vert["y"]>maxy){
        maxy=vert["y"]
      }
      if(vert["y"]<miny){
        miny=vert["y"]
      }
      if(vert["x"]>maxx){
        maxy=vert["x"]
      }
      if(vert["x"]<minx){
        miny=vert["x"]
      }
    }
    const extrudedGeometry = new THREE.ExtrudeGeometry(svgShape, { depth: Math.abs(maxz - minz), bevelEnabled: false });
    extrudedGeometry.computeBoundingBox()
    const material = new THREE.MeshBasicMaterial( { color: 0xFFFFFF, wireframe:true } );
    const mesh = new THREE.Mesh( extrudedGeometry, material );
    if(minz<0){
      mesh.position.z = minz;
    }
    annotations.add(mesh)
    return annotations
  }



  fitCameraToSelection(camera, controls, selection, fitOffset = 1.2) {
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

    this.controls.maxDistance = distance * 10;
    this.controls.target.copy(this.center);

    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();

    this.camera.position.copy(this.controls.target).sub(direction);

    this.controls.update();
  };

  initThreeJS(domelement,verts,meshurls) {
    let loader;
    let minz=Number.MAX_VALUE
    let maxz=Number.MIN_VALUE
    let miny=Number.MAX_VALUE
    let maxy=Number.MIN_VALUE
    let minx=Number.MAX_VALUE
    let maxx=Number.MIN_VALUE
    let vertarray=[]
    let annotations=new THREE.Group();
    const objects=new THREE.Group();
    console.log(verts)
    const svgShape = new THREE.Shape();
    let first=true
    let height=500
    let width=480
    annotations=prepareAnnotationFromJSON(verts,annotations)
    const gui = new dat.GUI({autoPlace: false})
    gui.domElement.id="gui"
    document.getElementById("threejsnav").appendChild(gui.domElement)
    const geometryFolder = gui.addFolder("Mesh");
    geometryFolder.open();
    const lightingFolder = geometryFolder.addFolder("Lighting");
    const geometryF = geometryFolder.addFolder("Geometry");
    geometryF.open();
    this.renderer = new THREE.WebGLRenderer( { antialias: false } );
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.setSize( width, height);
    document.getElementById(domelement).appendChild( renderer.domElement );
    let bbox=null
    if(meshurls.length>0){
      if(meshurls[0].includes(".ply")){
        loader = new PLYLoader();
        loader.load(meshurls[0], function(object){
          const material = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            flatShading: true,
            vertexColors: THREE.VertexColors,
            wireframe: false
          });
          const mesh = new THREE.Mesh(object, material);
          objects.add(mesh);
          scene.add(objects);
          addRotationControls(object,geometryF,objects)
          if(objects.children.length>0){
            camera.lookAt( objects.children[0].position );
          }
          fitCameraToSelection(camera, controls, objects.children)
        });
      }else if(meshurls[0].includes(".obj")){
        loader = new OBJLoader();
        loader.load(meshurls[0],function ( object ) {objects.add(object);scene.add(objects); addRotationControls(object,geometryF,objects);if(objects.children.length>0){camera.lookAt( objects.children[0].position );}fitCameraToSelection(camera, controls, objects.children) })
      }else if(meshurls[0].includes(".nxs") || meshurls[0].includes(".nxz")){
        const nexus_obj = new NexusObject(meshurls[0], function() {
        }, renderNXS, this.renderer);
        objects.add(nexus_obj)
        scene.add(objects);
        this.addRotationControls(nexus_obj,geometryF,objects)
        if(objects.children.length>0){
          camera.lookAt( objects.children[0].position );
        }
        this.fitCameraToSelection(camera, controls, objects.children)
      }else if(meshurls[0].includes(".gltf")){
        loader = new GLTFLoader();
        loader.load(meshurls[0], function ( gltf )
        {
          let box = gltf.scene;
          box.position.x = 0;
          box.position.y = 0;
          objects.add(box)
          scene.add(objects);
          this.addRotationControls(box,geometryF,objects)
          if(objects.children.length>0){
            camera.lookAt( objects.children[0].position );
          }
          this.fitCameraToSelection(camera, controls, objects.children)
        });
      }
    }
    //camera = new THREE.PerspectiveCamera(90,window.innerWidth / window.innerHeight, 0.1, 150 );
    let camera = new THREE.PerspectiveCamera(90,width / height, 0.1, 2000 );
    scene.add(new THREE.AmbientLight(0x222222));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(20, 20, 0);
    scene.add(light);
    lightingFolder.add(light.position, "x").min(-5).max(5).step(0.01).name("X Position")
    lightingFolder.add(light.position, "y").min(-5).max(5).step(0.01).name("Y Position")
    lightingFolder.add(light.position, "z").min(-5).max(5).step(0.01).name("Z Position")

    scene.add( this.axesHelper );
    console.log("Depth: "+(maxz-minz))
    scene.add( annotations );
    let centervec=new THREE.Vector3()
    let controls = new OrbitControls( this.camera, this.renderer.domElement );
    //controls.target.set( centervec.x,centervec.y,centervec.z );
    controls.target.set( 0,0,0 );
    camera.position.x= 0
    camera.position.y= 0
    camera.position.z = 150;
    controls.maxDistance= Math.max(1000, 1000, 1000)
    controls.update();
    const updateCamera = () => {
      camera.updateProjectionMatrix();
    }
    const cameraFolder = geometryFolder.addFolder("Camera");
    cameraFolder.add(camera, 'fov', 1, 180).name('Zoom').onChange(updateCamera);
    cameraFolder.add(camera.position, 'x').min(-500).max(500).step(5).name("X Position").onChange(updateCamera);
    cameraFolder.add(camera.position, 'y').min(-500).max(500).step(5).name("Y Position").onChange(updateCamera);
    cameraFolder.add(camera.position, 'z').min(-500).max(500).step(5).name("Z Position").onChange(updateCamera);
    gui.add(objects, 'visible').name('Meshes')
    gui.add(annotations, 'visible').name('Annotations')
    gui.add(this.axesHelper, 'visible').name('Axis Helper')
    gui.add({"FullScreen":toggleFullScreen2}, 'FullScreen')
    document.addEventListener("fullscreenchange",function(){
      if(document.fullscreenElement){
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        this.renderer.setSize( width, height );
      }
    })
    if(meshurls.length>0 && (meshurls[0].includes(".nxs") || meshurls[0].includes(".nxz"))){
      this.renderNXS()
    }
    this.animate()
  }

  animate() {
    requestAnimationFrame( animate );
    this.controls.update();
    this.renderer.render( scene, this.camera );
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
    this.initThreeJS(this.container)
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
