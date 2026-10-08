from ultralytics import YOLO

#Initialize YOLO with the Model Name
model = YOLO("weights_yolov26s_v1.pt")

##Predict Method Takes all the parameters of the Command Line Interface

model.predict(source="0", show=True, conf=0.15)
