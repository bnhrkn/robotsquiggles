import React, { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTheme } from "@material-ui/core";
import Two from "two.js";

import { FIELD_METERS } from "../services/units";
import {
  updateVectorP,
  updateVectorR,
  createPath,
  initNextPath,
  deletePoint,
  deletePath,
  selectPaths,
  selectPathsAction,
  curPathKey,
  nextChar,
  createPoints,
} from "./redux/slice";
import { Field } from "./field";

export const DrawNewPath = (props) => {
  const mount = useRef(null);
  const two = useRef(null);
  const group = useRef(null);

  const startWidth = useRef(null);
  const savedBoundingRect = useRef(null);
  const savedLeft = useRef(null);

  const prevMode = useRef(null);
  const prevLatch = useRef(null);

  const listeners = useRef([]);

  const theme = useTheme();
  const neutralColor = "#333";
  const editColor = theme.palette.primary.main;
  const robotColor = theme.palette.primary.light;
  const red = "rgb(255, 40, 40)";

  const robotSquare = useRef(null);

  const {
    drawerWidth,
    open,
    mode,
    setMode,
    field,
    oldpaths,
    setPaths,
    setCanvasDims,
    latch,
    trackWidth,
    badPaths,
  } = props;

  const dispatch = useDispatch();
  const paths = useSelector(selectPaths);
  const pathsAction = useSelector(selectPathsAction);

  /**
   * Modifies the mouse event to fit with the Two canvas coordinates.
   *
   * @param e The mouse event
   *
   * @returns {x: number, y: number}
   */
  const getCursorPosition = (e) => {
    const x = e.clientX + window.pageXOffset;
    const y = e.clientY + window.pageYOffset;
    // relying on savedLeft to tell us if the drawer is open
    const left = savedBoundingRect.current.left + savedLeft.current ?? 0;
    const top = savedBoundingRect.current.top;
    return {
      x: (x - left) / two.current.scene.scale,
      y: (y - top) / two.current.scene.scale,
    };
  };

  const addInteractivity = (shape) => {
    const offset = group.current.translation;

    var drag = function (e) {
      e.preventDefault();
      const cursor = getCursorPosition(e);
      var x = cursor.x - offset.x;
      var y = cursor.y - offset.y;
      shape.translation.set(x, y);
    };
    var touchDrag = function (e) {
      e.preventDefault();
      var touch = e.originalEvent.changedTouches[0];
      drag({
        preventDefault: function () {},
        clientX: touch.pageX,
        clientY: touch.pageY,
      });
      return false;
    };
    var dragEnd = function (e) {
      e.preventDefault();

      if (latch) {
        paths.forEach((p) => {
          p.vectors.forEach((v) => {
            if (v.p.id === shape.id) {
              // This shape is a point, latch it to nearby points
              paths.forEach((p2) => {
                if (p.path?.id === p2.path?.id) return;
                p2.vectors.forEach((v2) => {
                  const dist = Math.sqrt(
                    Math.pow(v.p.translation.x - v2.p.translation.x, 2) +
                      Math.pow(v.p.translation.y - v2.p.translation.y, 2)
                  );
                  if (dist > 0.01 && dist < 40) {
                    v.p.translation.set(v2.p.translation.x, v2.p.translation.y);
                  }
                });
              });
            }

            if (v.r.id === shape.id) {
              // This shape is a vector head, latch the vector angle using its point
              if (
                Math.abs(shape.rotation) < 0.1 ||
                Math.abs(shape.rotation - Math.PI) < 0.1
              ) {
                shape.translation.set(v.p.translation.x, shape.translation.y);
              } else if (
                Math.abs(Math.abs(shape.rotation) - Math.PI / 2) < 0.1 ||
                Math.abs(shape.rotation - (3 * Math.PI) / 2) < 0.1
              ) {
                shape.translation.set(shape.translation.x, v.p.translation.y);
              }
            }
          });
        });
      }

      window.removeEventListener("mousemove", drag);
      window.removeEventListener("mouseup", dragEnd);
    };
    var touchEnd = function (e) {
      e.preventDefault();
      window.removeEventListener("touchmove", touchDrag);
      window.removeEventListener("touchend", touchEnd);
      return false;
    };

    addNewEventListener(shape._renderer.elem, "mousedown", function (e) {
      e.preventDefault();
      window.addEventListener("mousemove", drag);
      window.addEventListener("mouseup", dragEnd);
    });
    addNewEventListener(shape._renderer.elem, "touchstart", function (e) {
      e.preventDefault();
      window.addEventListener("touchmove", touchDrag);
      window.addEventListener("touchend", touchEnd);
      return false;
    });
  };

  const createAnchorPoint = useCallback(
    (anchor, newPath, pathKey, idx) => {
      if (pathKey === "A" && anchor === newPath._collection[0]) {
        // put the robot on the first path's start
        robotSquare.current = two.current.makeRectangle(
          anchor.x,
          anchor.y,
          (two.current.width / FIELD_METERS) * trackWidth,
          (two.current.width / FIELD_METERS) * trackWidth
        );
        robotSquare.current.noFill().stroke = robotColor;
        robotSquare.current.linewidth = 2;
        group.current.add(robotSquare.current);
      }

      const p = two.current.makeCircle(0, 0, 10);
      const r = two.current.makePolygon(0, 0, 10);
      r.rotation =
        Math.atan2(anchor.controls.right.y, anchor.controls.right.x) +
        Math.PI / 2;

      p.translation.copy(anchor);
      r.translation.copy(anchor.controls.right).addSelf(anchor);
      p.noStroke().fill = r.noStroke().fill = editColor;

      const rl = new Two.Path([
        new Two.Anchor().copy(p.translation),
        new Two.Anchor().copy(r.translation),
      ]);
      rl.noFill().stroke = editColor;

      const g = two.current.makeGroup(rl, p, r);
      g.translation.addSelf(newPath.translation);
      group.current.add(g);

      p.translation.bind(Two.Events.change, function () {
        anchor.copy(this);
        r.translation.copy(anchor.controls.right).addSelf(this);
        rl.vertices[0].copy(this);
        rl.vertices[1].copy(r.translation);
        if (robotSquare.current) robotSquare.current.translation.copy(this);

        dispatch(updateVectorP({ pathKey: pathKey, point: p }));
      });
      r.translation.bind(Two.Events.change, function () {
        anchor.controls.right.copy(this).subSelf(anchor);
        rl.vertices[1].copy(this);

        const x = -1 * (anchor.controls.right.x - anchor.x);
        const y = -1 * (anchor.controls.right.y - anchor.y);
        const opp = new Two.Vector(x, y);
        anchor.controls.left.copy(opp).subSelf(anchor);

        const rot =
          Math.atan2(anchor.controls.right.y, anchor.controls.right.x) +
          Math.PI / 2;
        r.rotation = rot;
        if (robotSquare.current) robotSquare.current.rotation = rot;

        dispatch(updateVectorR({ pathKey: pathKey, point: r }));
        // setPaths(
        //   new Map(
        //     props.paths.set(pathKey, {
        //       waypoints: props.paths.get(pathKey).waypoints,
        //       vectors: props.paths
        //         .get(pathKey)
        //         .vectors.map((v) =>
        //           v.r.id === r.id ? { s: v.s, g: v.g, p: v.p, r: r } : v
        //         ),
        //       path: props.paths.get(pathKey).path,
        //     })
        //   )
        // );
      });

      // Update the renderer in order to generate the actual elements.
      two.current.update();

      return { s: robotSquare.current.id, g: g.id, p: p.id, r: r.id };

      // setPaths(
      //   new Map(
      //     props.paths.set(pathKey, {
      //       waypoints: props.paths.get(pathKey).waypoints,
      //       vectors: updatedVec,
      //       path: newPath,
      //     })
      //   )
      // );
    },
    [dispatch, editColor, robotColor, trackWidth]
  );

  const drawLine = (anchors) => {
    const newPath = new Two.Path(anchors, false, true, true);
    newPath.cap = newPath.join = "round";
    newPath.noFill().stroke = neutralColor;
    newPath.linewidth = 5;
    group.current.add(newPath);
    return newPath;
  };

  // TODO: handle the case where a point is inserted

  const createNewPath = useCallback(
    (pathKey) => {
      const anchors = [];
      const lastPoint = paths[pathKey].waypoints.length - 1;
      for (let i = lastPoint; i >= 0; --i) {
        // iterate backwards through points so we are driving the right direction
        const p = two.current.scene.getById(paths[pathKey].waypoints[i]);
        console.log(p);
        let anchor;
        if (i === lastPoint) {
          anchor = new Two.Anchor(
            p.translation.x,
            p.translation.y,
            0,
            100,
            0,
            -100,
            "M"
          );
          anchors.push(anchor);
        } else {
          anchor = new Two.Anchor(
            p.translation.x,
            p.translation.y,
            0,
            100,
            0,
            -100,
            "C"
          );
          anchors.push(anchor);
        }
        two.current.remove(p);
        two.current.update(); // render the elements before adding interactivity
      }

      group.current = two.current.makeGroup();
      const newPath = drawLine(anchors);

      const vectors = [];
      newPath.vertices.forEach(function (anchor) {
        vectors.push(createAnchorPoint(anchor, newPath, pathKey));
      });
      dispatch(
        createPath({
          pathKey: pathKey,
          vectors: vectors,
          path: newPath.id,
        })
      );
    },
    [two, paths, createAnchorPoint, dispatch]
  );

  useEffect(() => {
    if (pathsAction === "CREATE_PATH") {
      const pathKey = curPathKey({ paths: paths });
      createNewPath(pathKey);
      // create the next path's array
      dispatch(initNextPath({ pathKey: nextChar(pathKey) }));
      setMode("EDIT");
    }
  }, [pathsAction, createNewPath, dispatch, setMode, paths]);

  // TODO: move all of this logic into redux slice
  const placePoints = (e) => {
    e.preventDefault();

    const cursor = getCursorPosition(e);
    const point = two.current.makeCircle(cursor.x, cursor.y, 10);
    point.fill = editColor;

    dispatch(createPoints({ point: point }));
  };

  const addMidpoint = (path) => {
    const midpoint = path.path.getPointAt(0.5);
    const p = two.current.makeCircle(midpoint.x, midpoint.y, 10);
    const r2 = two.current.makePolygon(0, 0, 10);
    r2.rotation =
      Math.atan2(midpoint.controls.right.y, midpoint.controls.right.x) +
      Math.PI / 2;
    r2.translation.copy(midpoint.controls.right).addSelf(midpoint);
    return { p: p, r: r2 };
  };

  const addNewEventListener = (node, event, handler) => {
    const listener = { node: node, event: event, handler: handler };
    for (let i = 0; i < listeners.current.length; ++i) {
      if (listeners.current[i] === listener) {
        // the new event is already defined, don't define it again
        return;
      }
    }
    node.addEventListener(event, handler);
    listeners.current.push(listener);
  };

  // const deleteEventListener = (node, event, handler) => {
  //   const listener = { node: node, event: event, handler: handler };
  //   for (let i = 0; i < listeners.current.length; ++i) {
  //     if (listeners.current[i] === listener) {
  //       const x = listeners.current[i];
  //       x.node.removeEventListener(x.event, x.handler);
  //       listeners.current.remove(x);
  //       return;
  //     }
  //   }
  // };

  const removeAllEventListeners = () => {
    for (let i = 0; i < listeners.current.length; ++i) {
      const x = listeners.current[i];
      x?.node?.removeEventListener(x.event, x.handler);
    }
    listeners.current = [];
  };

  const capSize = (newWidth) => {
    return Math.max(100, Math.min(newWidth, 800));
  };

  const resize = useCallback(
    (width) => {
      width = capSize(width);
      two.current.scene.scale = width / startWidth.current;
      two.current.renderer.setSize(width, width);
      setCanvasDims({ x: startWidth.current, y: startWidth.current });
    },
    [two, setCanvasDims, startWidth]
  );

  /**
   * Resizes the Two.js canvas each time the component updates.
   */
  useEffect(() => {
    if (savedBoundingRect.current === null) {
      // we have not yet saved a box size, store it
      // We're storing the bounding client width because it updates out of
      // sync with the Material UI drawer
      savedBoundingRect.current = mount.current.getBoundingClientRect();
    }
    const boxWidth = savedBoundingRect.current.width;
    if (open) {
      savedLeft.current = drawerWidth;
      resize(boxWidth - drawerWidth);
    } else {
      savedLeft.current = 0;
      resize(boxWidth);
    }
  }, [open, drawerWidth, resize]);

  /**
   * Handles the State Machine for the edit modes.
   */
  useEffect(() => {
    if (mode === prevMode.current && latch === prevLatch.current) {
      // The below state machine only operates on the state transitions
      return;
    }

    switch (mode) {
      case "ADD_PATH":
        removeAllEventListeners();
        Object.entries(paths).forEach((p) => {
          if (!p.path) return;
          p.path.stroke = neutralColor;
          p.vectors.forEach((v) => {
            v.p.fill = neutralColor;
            v.r.fill = neutralColor;
          });
        });
        addNewEventListener(mount.current, "click", placePoints);
        break;
      case "EDIT":
        console.log("edit");
        removeAllEventListeners();

        Object.entries(paths).forEach((p) => {
          if (!p.vectors) return;
          if (p.path) {
            p.path.stroke = p.path.stroke === red ? red : neutralColor;
          }
          p.vectors.forEach((v) => {
            const p = two.current.scene.getById(v.p);
            const r = two.current.scene.getById(v.r);
            addInteractivity(p);
            addInteractivity(r);

            p.fill = editColor;
            r.fill = editColor;
          });
        });
        break;
      case "ADD_POINTS":
        removeAllEventListeners();

        Object.entries(paths).forEach((key, p) => {
          if (!p.path) return;

          p.vectors.forEach((v) => {
            v.p.fill = neutralColor;
            v.r.fill = neutralColor;
          });
          p.path.stroke = editColor;

          addNewEventListener(p.path._renderer.elem, "click", (e) => {
            const newVec = addMidpoint(p);
            const anchor = new Two.Anchor(
              newVec.p.translation.x,
              newVec.p.translation.y,
              100 * Math.cos(newVec.r.rotation + Math.PI / 2),
              100 * Math.sin(newVec.r.rotation + Math.PI / 2),
              -100 * Math.cos(newVec.r.rotation + Math.PI / 2),
              -100 * Math.sin(newVec.r.rotation + Math.PI / 2),
              "C"
            );
            const anchors = p.path.vertices;
            anchors.splice(1, 0, anchor); // insert anchor in the middle
            const newPath = drawLine(anchors);
            p.path = newPath;

            two.current.remove(newVec.p, newVec.r);
            createAnchorPoint(anchor, p.path, key, p.vectors.length - 1);
            setMode("EDIT");
          });
        });
        break;
      case "REMOVE_POINTS":
        removeAllEventListeners();

        Object.entries(paths).forEach((key, p) => {
          if (!p.path) return;

          p.vectors.forEach((v) => {
            v.p.fill = neutralColor;
            v.r.fill = neutralColor;
          });
          p.path.stroke = editColor;

          addNewEventListener(p.path._renderer.elem, "click", (e) => {
            const anchors = p.path.vertices;
            anchors.pop();
            if (anchors.length < 2) {
              p.vectors.forEach((v) => {
                v.g.remove();
                if (v.s) group.current.remove(v.s);
              });
              two.current.remove(p.path);
              // paths.delete(key);
              dispatch(deletePath({ pathKey: key }));
              // setPaths(new Map(paths));
            } else {
              const vec = p.vectors.pop();
              vec.g.remove();
              const newPath = drawLine(anchors);
              p.path = newPath;
              two.current.update();
              dispatch(deletePoint({ pathKey: key, path: newPath }));
              // setPaths(new Map(map.set(key, p)));
            }
          });
        });
        break;
      default:
        break;
    }
    prevLatch.current = latch;
    prevMode.current = mode;
  });

  useEffect(() => {
    Object.entries(paths).forEach((k, v) => {
      if (badPaths.get(k) === 1) {
        // this path is bad!
        v.path.stroke = red;
      } else if (v.path) {
        v.path.stroke = neutralColor;
      }
    });
    two.current.update();
  }, [paths, badPaths]);

  useEffect(() => {
    if (!robotSquare.current) return;

    robotSquare.current.width = (two.current.width / FIELD_METERS) * trackWidth;
    robotSquare.current.height =
      (two.current.width / FIELD_METERS) * trackWidth;
  }, [trackWidth]);

  return (
    <div ref={mount}>
      <Field
        two={two}
        startWidth={startWidth}
        mount={mount}
        savedBoundingRect={savedBoundingRect}
        capSize={capSize}
        resize={resize}
        field={field}
      />
    </div>
  );
};
