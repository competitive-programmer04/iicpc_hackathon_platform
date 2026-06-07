# installing the latest go compiler
FROM golang:1.26-alpine

# declaring the working directory
WORKDIR /app

#building the dependencies
COPY go.mod ./
COPY go.sum ./
RUN go mod download

# Copying our go bot code and building its binary
COPY . .
RUN go build -o load_generator main.go

#Exposing our grpc port 
EXPOSE 50051

#Running our go bot generator
CMD ["./load_generator"]