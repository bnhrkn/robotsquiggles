#ifndef _PASSTHROUGH_MODEL_HPP_
#define _PASSTHROUGH_MODEL_HPP_

#include "physicalmodel/physicalmodel.hpp"

// This silences a warning in GCC/Clang about not using passed parameters
#define UNUSED __attribute__((unused))

namespace squiggles {
class PassthroughModel : public PhysicalModel {
  public:
  PassthroughModel() = default;

  Constraints constraints(UNUSED const Pose pose,
                          UNUSED double curvature,
                          UNUSED double vel) override {
    return Constraints();
  };

  std::string to_string() override {
    return "PassthroughModel {}";
  }
};
} // namespace squiggles

#endif