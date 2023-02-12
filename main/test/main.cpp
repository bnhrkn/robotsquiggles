#include "squiggles.hpp"
#include "gtest/gtest.h"
using namespace squiggles;

int main(int argc, char** argv) {
  ::testing::InitGoogleTest(&argc, argv);
  auto constraints = Constraints(2.0, 2.0, 9.0);
  auto model = std::make_shared<TankModel>(0.32385, constraints);
  auto spline = SplineGenerator(constraints, model, 0.01);
  auto path = spline.generate({
    ControlVector(Pose(0, 0, 0), 0.0, 0.0),
    ControlVector(Pose(0.0508, 0, 0), 0.0, 0.0),
  });
  for (auto point : path) {
    auto pose = point.vector.pose;
    std::cout << "X: " << pose.x << " Y: " << pose.y << " Yaw: " << pose.yaw
              << " Vel: " << point.vector.vel << std::endl;
  }
  return RUN_ALL_TESTS();
}