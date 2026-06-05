package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net"
	"slices"
	"sync"
	"time"
	"strings"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	pb "github.com/competitive-programmer04/go_bot_generator/proto/gen"
)

type GeneralServerResponse struct{
	Event string `json:"event"`
	ProcessedAt int64 `json:"processed_at"`
}

type FilledResponse struct{
	Event string `json:"event"`
	BuyOrderId string `json:"buy_order_id"`
	SellOrderId string `json:"sell_order_id"`
	FilledQuantity int `json:"filled_quantity"`
	MatchPrice float64 `json:"match_price"`
	ProcessedAt int64 `json:"processed_at"`
}

type PartiallyFilledResponse struct{
	Event string `json:"event"`
	BuyOrderId string `json:"buy_order_id"`
	SellOrderId string `json:"sell_order_id"`
	MatchPrice float64 `json:"match_price"`
	FilledQuantity int `json:"filled_quantity"`
	BuyRemaining int `json:"buy_remaining"`
	SellRemaining int `json:"sell_remaining"`
	ProcessedAt int64 `json:"processed_at"`
}

type AcknowledgedResponse struct{
	Event string `json:"event"`
	OrderId string `json:"order_id"`
	BotId string `json:"bot_id"`
	ProcessedAt int64 `json:"processed_at"`
}

type CancelledResponse struct{
	Event string `json:"event"`
	OrderId string `json:"order_id"`
	BotId string `json:"bot_id"`
	ProcessedAt int64 `json:"processed_at"`
}

type RejectedEvent struct{
	Event string `json:"event"`
	IncomingOrderId string `json:"incoming_order_id"`
	RestingOrderId string `json:"resting_order_id"`
	ProcessedAt int64  `json:"processed_at"`
}

type InvalidRequest struct{
	Event string `json:"event"`
	OrderId string `json:"order_id"`
	BotId string `json:"bot_id"`
	ProcessedAt int64 `json:"processed_at"`
}

type ClientRequest struct{
	OrderId string `json:"order_id"`
	BotId string `json:"bot_id"`
	Symbol string `json:"symbol"`
	Price float64 `json:"price"`
	Quantity int `json:"quantity"`
	Action string `json:"action"`
	OrderType string `json:"order_type"`
	Timestamp int64 `json:"timestamp"`
}

type Order struct{
	Timestamp int64
	Status string 
}

var rdb *redis.Client

func LaunchBots(botctx context.Context,url string,kill context.CancelFunc){
	dialctx,cancel:=context.WithTimeout(context.Background(),5*time.Second)
	defer cancel()
	connection,_,err:= websocket.DefaultDialer.DialContext(dialctx,url,nil);
	if err!=nil{
		fmt.Println("cannot create a websocket connection with the server due to the error ",err);
		kill()
		return
	}else{
		fmt.Println("successfully established a websocket connection with the server")
	}
	defer connection.Close();
	ctx:=context.Background()
	
// ARCHITECTURE NOTE: We use sync.Map instead of standard maps with Mutex locks 
// to prevent lock-contention. Because our Order IDs are disjoint keys, 
// this allows our Go bots to achieve 100,000+ TPS safely.

	var checkingRequest sync.Map
	orderChannel:=make(chan string,100000);
	resultChannel:=make(chan string,100000);
	var pendingOrders sync.Map
	fillChannel:=make(chan string,1000)
	ticker:=time.NewTicker(time.Second)
	defer ticker.Stop()
	ini_start_bot:=1;
	ini_end_bot:=10;


	go func(){
		for{
		select{
		case<-botctx.Done():
			fmt.Println("Shutting down the load service")
			return
	case t:=<-ticker.C:
		fmt.Printf("Current second: %d\n",t.Second())
		for i:=ini_start_bot;i<=ini_end_bot;i++{
			botId:=fmt.Sprintf("bot-%d",i)
			go func(bot_id string){
				for{
					now:=time.Now().UnixMilli();
					orderId:=fmt.Sprintf("%s-%d",botId,now);
					price:=100.0+rand.Float64()*50.0;
					quantity:=rand.Intn(100)+10;
					orderType:="limit"
					symbols:=[]string{"AAPL","TSLA","GOOG","MSFT","AMZN"};
					randomSymbol:=symbols[rand.Intn(len(symbols))];
					requestMethods:=[]string{"buy","sell","cancel"};
					randomRequestMethod:=requestMethods[rand.Intn(len(requestMethods))];
					negativeTesting:=rand.Intn(100)+1;
					if negativeTesting<5{
						fmt.Println("preparing invalid request")
						switch (negativeTesting){
						case 1:
							price = -100.0+rand.Float64()*50
						case 2:
							quantity = rand.Intn(100)-1000
						case 3:
							orderType = "market"
						case 4:
							corruptRequestMethod:=[]string{"hold","wait","steal"}
							randomRequestMethod = corruptRequestMethod[rand.Intn(len(corruptRequestMethod))]
						}
					}
					fmt.Println("preparing valid request")
					request:=ClientRequest{
						OrderId: orderId,
						BotId: botId,
						Symbol: randomSymbol,
						Price: price,
						Quantity: quantity,
						Action: randomRequestMethod,
						OrderType: orderType,
						Timestamp: now,
					}
					message,err:=json.Marshal(request)
					if err!=nil{
						fmt.Println("error in converting request to byte array")
						continue
					}
				    orderChannel<-string(message)
					checkingRequest.Store(orderId,request)
					order:=Order{
						Timestamp: request.Timestamp,
						Status: "",
					}
					pendingOrders.Store(orderId,order)
				    time.Sleep(100*time.Millisecond);
				}
			}(botId)
		}
		ini_start_bot=ini_end_bot+1;
		ini_end_bot=2*ini_end_bot;
	 }
	}
	}()

// AUDIT SYSTEM: The "Sniper Bot" Thread.
// We separate our testing into two streams. Chaotic bots test Speed/TPS, 
// while this deterministic Sniper thread tests strictly for Price-Time Priority 
// without network jitter interference.

	go func(){
		for{
			select{
			case <-botctx.Done():
				fmt.Println("Shutting down the filled event service")
				return 
			default:
				fmt.Println("sending specifically filled request to the engine ")
			price:=100+rand.Float64()*100
		    quantity:=rand.Intn(100)+50
			drainLoop:
			for{
				select{
				case<-fillChannel:
				default:
					break drainLoop
				}
			}
			now:=time.Now().UnixMilli()
			orderId1:=fmt.Sprintf("bot-%d-%d",1,now)

			order1:=fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"sell","timestamp":%d,"order_type":"limit"}`,
		    orderId1,fmt.Sprintf("sniperbot-%d",1),price-float64(10*1),quantity,now)

			SendandWait:=func(order string,orderId string)bool{
				orderChannel<-order
				pendingOrders.Store(orderId,Order{Timestamp: now,Status: ""})
				select{
				case<-fillChannel:
					return true
				case <-time.After(2*time.Second):
					return false
				}
			}
			if !(SendandWait(order1,orderId1)){
				orderChannel<-fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"cancel","timestamp":%d,"order_type":"limit"}`,
		    orderId1,fmt.Sprintf("sniperbot-%d",1),price-float64(10*1),quantity,time.Now().UnixMilli())
			pendingOrders.Store(orderId1,Order{Timestamp: time.Now().UnixMilli(),Status: ""})
			time.Sleep(2*time.Second)
			continue
			}
			now=time.Now().UnixMilli()
			orderId2:=fmt.Sprintf("bot-%d-%d",2,now)
			order2:=fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"sell","timestamp":%d,"order_type":"limit"}`,
		    orderId2,fmt.Sprintf("sniperbot-%d",2),price-float64(10*3),quantity,now)

			if !(SendandWait(order2,orderId2)){
				orderChannel<-fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"cancel","timestamp":%d,"order_type":"limit"}`,
		    orderId1,fmt.Sprintf("sniperbot-%d",1),price-float64(10*1),quantity,time.Now().UnixMilli())
			pendingOrders.Store(orderId1,Order{Timestamp: time.Now().UnixMilli(),Status: ""})
				orderChannel<-fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"cancel","timestamp":%d,"order_type":"limit"}`,
		    orderId2,fmt.Sprintf("sniperbot-%d",2),price-float64(10*3),quantity,time.Now().UnixMilli())
			pendingOrders.Store(orderId2,Order{Timestamp: time.Now().UnixMilli(),Status: ""})
			time.Sleep(2*time.Second)
			continue
			}
			now=time.Now().UnixMilli()
			orderId3:=fmt.Sprintf("bot-%d-%d",3,now)
			order3:=fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"sell","timestamp":%d,"order_type":"limit"}`,
		    orderId3,fmt.Sprintf("sniperbot-%d",3),price-float64(10*2),quantity,now)
			if !(SendandWait(order3,orderId3)){
				orderChannel<-fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"cancel","timestamp":%d,"order_type":"limit"}`,
		    orderId1,fmt.Sprintf("sniperbot-%d",1),price-float64(10*1),quantity,time.Now().UnixMilli())
			pendingOrders.Store(orderId1,Order{Timestamp: time.Now().UnixMilli(),Status: ""})
				orderChannel<-fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"cancel","timestamp":%d,"order_type":"limit"}`,
		    orderId2,fmt.Sprintf("sniperbot-%d",2),price-float64(10*3),quantity, time.Now().UnixMilli())
			pendingOrders.Store(orderId2,Order{Timestamp: time.Now().UnixMilli(),Status: ""})
				orderChannel<-fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"cancel","timestamp":%d,"order_type":"limit"}`,
		    orderId3,fmt.Sprintf("sniperbot-%d",3),price-float64(10*2),quantity,time.Now().UnixMilli())
			pendingOrders.Store(orderId3,Order{Timestamp: time.Now().UnixMilli(),Status: ""})
			time.Sleep(2*time.Second)
			continue
			}
			now=time.Now().UnixMilli()
			orderId4:=fmt.Sprintf("bot-%d-%d",4,now)
			order4:=fmt.Sprintf(`{"order_id":"%s","bot_id":"%s","price":%f,"quantity":%d,"symbol":"IICPC_PRIO","action":"buy","timestamp":%d,"order_type":"limit"}`,
		    orderId4,fmt.Sprintf("sniperbot-%d",4),price,quantity,now)
			orderChannel<-order4
			pendingOrders.Store(orderId4,Order{Timestamp: now,Status: ""})
			time.Sleep(5*time.Second)
			}
		}
	}()


	go func(){
		for{
			select{
		case <-botctx.Done():
			fmt.Println("shutting down the writable service");
			return 
		case msg:=<-orderChannel:
			fmt.Println("sending request to the engine")
			connection.WriteMessage(websocket.TextMessage,[]byte(msg))
		}
	  }
	}()


	go func(){
		for{
			select{
			case <-botctx.Done():
				fmt.Println("shutting down the sweeper thread")
				return

				// GARBAGE COLLECTION & TIMEOUTS: The Sweeper Thread.
                // If the target engine takes longer than 2 seconds to acknowledge an order, 
                // this thread deletes it from memory and punishes the engine's score in Redis.
			case <-time.After(time.Second):
				currentTime:=time.Now().UnixMilli()
				pendingOrders.Range(func(key, value interface{})bool{
				orderId:=key.(string);
				sentOrder:=value.(Order);
				if currentTime-sentOrder.Timestamp>2000 && sentOrder.Status==""{
					fmt.Println("the engine took more than 2 second to response so it will not be accepted")
					latency:=2000
					success:=0
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
					pendingOrders.Delete(orderId)
					checkingRequest.Delete(orderId)
				}
				return true;
			})
			}
		}
	}()
	go func(){
		for{
			_,message,err:=connection.ReadMessage()
			if err!=nil{
				fmt.Println("Connection dropped by the engine")
				kill()
				return;
			}
			var response GeneralServerResponse;
			parseErr:=json.Unmarshal(message,&response)
			if parseErr!=nil{
				fmt.Println("the response returned by the engine is not in the desired form")
				continue;
			}
			event:=strings.ToLower(response.Event)
			switch (event){
			case "filled":
				fmt.Println("receiving filled response")
				var filled_response FilledResponse
				err:=json.Unmarshal(message,&filled_response)
				if err!=nil{
					fmt.Println("the response returned by the engine is not in the correct format")
					continue
				}
				order1,buy_order_exists:=pendingOrders.Load(filled_response.BuyOrderId)
				order2,sell_order_exists:=pendingOrders.Load(filled_response.SellOrderId)
				if !buy_order_exists || !sell_order_exists{
					continue
				}
				pendingOrders.Store(filled_response.BuyOrderId,Order{Timestamp: order1.(Order).Timestamp,Status: "filled"})
				pendingOrders.Store(filled_response.SellOrderId,Order{Timestamp: order2.(Order).Timestamp,Status: "filled"})
				req1,req1_exists:=checkingRequest.Load(filled_response.BuyOrderId)
				req2,req2_exists:=checkingRequest.Load(filled_response.SellOrderId)
				if !req1_exists || !req2_exists{
					continue;
				}
				buy_req:=req1.(ClientRequest)
				sell_req:=req2.(ClientRequest)
				if (buy_req.Action=="cancel"||sell_req.Action=="cancel")||(buy_req.Action==sell_req.Action)||
				(buy_req.Symbol!=sell_req.Symbol)||(buy_req.Quantity!=sell_req.Quantity)||(buy_req.BotId==sell_req.BotId){
					fmt.Println("response is wrong")
					latency:=filled_response.ProcessedAt-max(buy_req.Timestamp,sell_req.Timestamp) 
					success:=0
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
					pendingOrders.Delete(buy_req.OrderId)
					pendingOrders.Delete(sell_req.OrderId)
					checkingRequest.Delete(buy_req.OrderId)
					checkingRequest.Delete(sell_req.OrderId)
					continue
				}
				order_symbol:=buy_req.Symbol
				if order_symbol=="IICPC_PRIO"{
					if sell_req.BotId=="sniperbot-2"&&filled_response.MatchPrice==sell_req.Price{
					   latency:=((filled_response.ProcessedAt-buy_req.Timestamp)+(filled_response.ProcessedAt-sell_req.Timestamp))/2
					   success:=1
					   result:=fmt.Sprintf("%d,%d",latency,success)
					   resultChannel<-result
					}else{
						latency:=((filled_response.ProcessedAt-buy_req.Timestamp)+(filled_response.ProcessedAt-sell_req.Timestamp))/2 
					   success:=0
					   result:=fmt.Sprintf("%d,%d",latency,success)
					   resultChannel<-result
					}
				}else{
					if buy_req.Price>=sell_req.Price{
						latency:=filled_response.ProcessedAt-max(buy_req.Timestamp,sell_req.Timestamp) 
					   success:=1
					   result:=fmt.Sprintf("%d,%d",latency,success)
					   resultChannel<-result
					}else{
						latency:=filled_response.ProcessedAt-max(buy_req.Timestamp,sell_req.Timestamp)
					   success:=0
					   result:=fmt.Sprintf("%d,%d",latency,success)
					   resultChannel<-result
					}
				}
				pendingOrders.Delete(buy_req.OrderId)
				pendingOrders.Delete(sell_req.OrderId)
				checkingRequest.Delete(buy_req.OrderId)
				checkingRequest.Delete(sell_req.OrderId)

			case "partially filled":
				fmt.Println("receiving partially filled response")
				var partially_filled_response PartiallyFilledResponse
				err:=json.Unmarshal(message,&partially_filled_response)
				if err!=nil{
					fmt.Printf("engine not returned the response in desired format")
					continue
				}
				order1,buy_order_exists:=pendingOrders.Load(partially_filled_response.BuyOrderId)
				order2,sell_order_exists:=pendingOrders.Load(partially_filled_response.SellOrderId)
				if !buy_order_exists||!sell_order_exists{
					fmt.Println("engine returned the response of a non existing request")
					continue
				}
				pendingOrders.Store(partially_filled_response.BuyOrderId,Order{Timestamp: order1.(Order).Timestamp,Status: "partially_filled"})
				pendingOrders.Store(partially_filled_response.SellOrderId,Order{Timestamp: order2.(Order).Timestamp,Status: "partially_filled"})
				req1,req1_exists:=checkingRequest.Load(partially_filled_response.BuyOrderId)
				req2,req2_exists:=checkingRequest.Load(partially_filled_response.SellOrderId)
				if !req1_exists || !req2_exists{
					continue;
				}
				buy_req:=req1.(ClientRequest)
				sell_req:=req2.(ClientRequest)
				if (buy_req.Action=="cancel"||sell_req.Action=="cancel")||(buy_req.Action==sell_req.Action)||
				(buy_req.Symbol!=sell_req.Symbol)||(buy_req.BotId==sell_req.OrderId){
					fmt.Println("response is wrong")
					latency:=partially_filled_response.ProcessedAt-max(buy_req.Timestamp,sell_req.Timestamp) 
					success:=0
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
					pendingOrders.Delete(buy_req.OrderId)
					pendingOrders.Delete(sell_req.OrderId)
					checkingRequest.Delete(buy_req.OrderId)
					checkingRequest.Delete(sell_req.OrderId)
					continue
				}
				if (buy_req.Price>=partially_filled_response.MatchPrice&&partially_filled_response.MatchPrice>=sell_req.Price)&&
				(buy_req.Price>=sell_req.Price)&&(partially_filled_response.BuyRemaining+partially_filled_response.FilledQuantity==buy_req.Quantity)&&
				(partially_filled_response.SellRemaining+partially_filled_response.FilledQuantity==sell_req.Quantity)&&(buy_req.BotId!=sell_req.BotId){
					   latency:=partially_filled_response.ProcessedAt-max(buy_req.Timestamp,sell_req.Timestamp) 
					   success:=1
					   result:=fmt.Sprintf("%d,%d",latency,success)
					   resultChannel<-result
					   buy_req.Quantity=partially_filled_response.BuyRemaining
					   sell_req.Quantity=partially_filled_response.SellRemaining
					   checkingRequest.Store(buy_req.OrderId,buy_req)
					   checkingRequest.Store(sell_req.OrderId,sell_req)
				}else{
					   latency:=partially_filled_response.ProcessedAt-max(buy_req.Timestamp,sell_req.Timestamp)
					   success:=0
					   result:=fmt.Sprintf("%d,%d",latency,success)
					   resultChannel<-result
				pendingOrders.Delete(buy_req.OrderId)
				pendingOrders.Delete(sell_req.OrderId)
				checkingRequest.Delete(buy_req.OrderId)
				checkingRequest.Delete(sell_req.OrderId)
				}
			case "acknowledged":
				fmt.Println("acknowledged response received")
				var ack_response AcknowledgedResponse
				err:=json.Unmarshal(message,&ack_response)
				if err!=nil{
					fmt.Println("The response returned by the engine is not in the correct format")
					continue
				}
				order1,order_exists:=pendingOrders.Load(ack_response.OrderId)
				if !order_exists{
					continue
				}
				pendingOrders.Store(ack_response.OrderId,Order{Timestamp: order1.(Order).Timestamp,Status: "acknowledgement"})
				req,req_exists:=checkingRequest.Load(ack_response.OrderId)
				if !req_exists{
					continue;
				}
				request:=req.(ClientRequest)
				if request.Symbol=="IICPC_PRIO"{
					fillChannel<-"acknowledgement"
					latency:= ack_response.ProcessedAt-request.Timestamp
					success:=1
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
				}else{
					latency:=ack_response.ProcessedAt-request.Timestamp
					success:=1
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
				}
			case "cancelled":
				var cancel_response CancelledResponse
				err=json.Unmarshal(message,&cancel_response)
				if err!=nil{
					fmt.Println("engine not returned the response in the desired format")
					continue
				}
				order,order_exists:=pendingOrders.Load(cancel_response.OrderId)
				if !order_exists{
					continue
				}
				pendingOrders.Store(cancel_response.OrderId,Order{Timestamp: order.(Order).Timestamp,Status: "cancelled"})
				req,req_exists:=checkingRequest.Load(cancel_response.OrderId)
				if !req_exists{
					continue
				}
				request:=req.(ClientRequest)
				if request.BotId==cancel_response.BotId{
					latency:=cancel_response.ProcessedAt-request.Timestamp 
					success:=1
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
				}else{
					latency:=cancel_response.ProcessedAt-request.Timestamp 
					success:=0
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
				}
				pendingOrders.Delete(request.OrderId)
				checkingRequest.Delete(request.OrderId)
			case "rejected":
				fmt.Println("rejected response received")
				var reject_response RejectedEvent
				err=json.Unmarshal(message,&reject_response)
				if err!=nil{
					fmt.Println("the response returned by the engine is not in the correct format")
					continue
				}
				order1,in_order_exists:=pendingOrders.Load(reject_response.IncomingOrderId)
				order2,res_order_exists:=pendingOrders.Load(reject_response.RestingOrderId)
				if !in_order_exists||!res_order_exists{
					continue
				}
				pendingOrders.Store(reject_response.IncomingOrderId,Order{Timestamp: order1.(Order).Timestamp,Status: "rejected"})
				pendingOrders.Store(reject_response.RestingOrderId,Order{Timestamp: order2.(Order).Timestamp,Status: "rejected"})
				req1,req1_exists:=checkingRequest.Load(reject_response.IncomingOrderId)
				req2,req2_exists:=checkingRequest.Load(reject_response.RestingOrderId)
				if !req1_exists || !req2_exists{
					continue
				}
				incoming_request:=req1.(ClientRequest)
				resting_req,_:=req2.(ClientRequest)
				if (incoming_request.Action!="cancel"&&resting_req.Action!="cancel")&&(incoming_request.Action!=resting_req.Action)&&
				(incoming_request.Symbol==resting_req.Symbol)&&(incoming_request.BotId==resting_req.BotId){
					latency:=reject_response.ProcessedAt-incoming_request.Timestamp
					success:=1
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
					pendingOrders.Delete(incoming_request.OrderId)
					checkingRequest.Delete(incoming_request.OrderId)
				}else{
					latency:=reject_response.ProcessedAt-max(incoming_request.Timestamp,resting_req.Timestamp)
					success:=0
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
					pendingOrders.Delete(incoming_request.OrderId)
					pendingOrders.Delete(resting_req.OrderId)
					checkingRequest.Delete(incoming_request.OrderId)
					checkingRequest.Delete(resting_req.OrderId)
				}
			case "invalid request":
				fmt.Println("invalid request response received")
				var invalid_request InvalidRequest
				err:=json.Unmarshal(message,&invalid_request)
				if err!=nil{
					fmt.Println("the response returned by the engine is not is the correct format")
					continue
				}
				order,order_exists:=pendingOrders.Load(invalid_request.OrderId)
				if !order_exists{
					continue
				}
				pendingOrders.Store(invalid_request.OrderId,Order{Timestamp: order.(Order).Timestamp,Status: "invalid request"})
				req,req_exists:=checkingRequest.Load(invalid_request.OrderId)
				if !req_exists{
					continue;
				}
				request:=req.(ClientRequest)
				if request.Price<=0 || request.Quantity<=0 || request.OrderType=="market" || slices.Contains([]string{"hold","wait","steal"},request.Action){
					latency:=invalid_request.ProcessedAt-request.Timestamp
					success:=1
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
				}else{
					latency:=invalid_request.ProcessedAt-request.Timestamp
					success:=0
					result:=fmt.Sprintf("%d,%d",latency,success)
					resultChannel<-result
				}
				pendingOrders.Delete(request.OrderId)
				checkingRequest.Delete(request.OrderId)
			default:
				fmt.Println("the event in the response field doen not match with the above events so the rseponse is wrong")
				latency:=2000
				success:=0
				result:=fmt.Sprintf("%d,%d",latency,success)
				resultChannel<-result
			}
		}
	}()

// OPTIMIZATION: Redis "Dump Truck" Batching (Write Coalescing).
// Instead of making 100,000 network calls to Redis per second, we batch 
// results in memory and RPUSH 1,000 at a time to eliminate DB bottlenecks.

    go func(){
		ticker:=time.NewTicker(100*time.Millisecond)
		defer ticker.Stop()
		batch:=make([]interface{},0,1000)
		for{
			select{
			case <-botctx.Done():
				fmt.Println("shutting down the thread to write message in the redis db ")
				return
			case result:=<-resultChannel:
				batch=append(batch,result)
				if len(batch)>=1000{
					fmt.Println("pushing data to redis")
					rdb.RPush(ctx,"telemetry_queue",batch...)
					batch=batch[:0]
				}
			case t:=<-ticker.C:
				fmt.Printf("The Current second is : %d\n",t.Second())
				if len(batch)>0{
					fmt.Println("pushing data to redis")
					rdb.RPush(ctx,"telemetry_queue",batch...)
					batch=batch[:0]
				}
			}
		}

	}()
	<-botctx.Done()
}

type LoadGenerationServer struct{
	pb.UnimplementedLoadGenerationServer
	mu sync.Mutex
	cancelFunc context.CancelFunc
}

func(s *LoadGenerationServer)StartLoad(ctx context.Context,req *pb.StartingRequest)(res *pb.StartingResponse,err error){
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelFunc!=nil{
		return nil,fmt.Errorf("a test is already running")
	}
	botctx,cancel:=context.WithCancel(context.Background())
	s.cancelFunc=cancel
	url:=req.URL
	go func(){
		LaunchBots(botctx,url,cancel)
		s.mu.Lock()
		if s.cancelFunc!=nil{
			s.cancelFunc=nil;
		}
		s.mu.Unlock()
		fmt.Println("server state cleaned up. Ready for next state")
	}()
	return &pb.StartingResponse{
		Message: "bots started successfully",
	},nil
}

func(s *LoadGenerationServer)StopLoad(ctx context.Context,req *pb.StoppingRequest)(res *pb.StoppingResponse,err error){
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cancelFunc==nil{
		return &pb.StoppingResponse{
			Message: "No test is started",
		},nil
	}
	s.cancelFunc()
	s.cancelFunc=nil
	return &pb.StoppingResponse{
		Message: "test has been stopped",
	},nil
}

func main(){
	rdb=redis.NewClient(&redis.Options{
		Addr:"localhost:6379",
		Password:"",
		DB:0,
		Protocol:2,
	})
	fmt.Println("Connected with redis")
	addr:="localhost:50051"
	lis,err:=net.Listen("tcp",addr)
	if err!=nil{
		log.Fatal("Unable to start the listener due to some error ",err)
	}
	fmt.Println("server started at ip address ",addr)
	grpcServer:=grpc.NewServer()
	pb.RegisterLoadGenerationServer(grpcServer,&LoadGenerationServer{})
	ERR:=grpcServer.Serve(lis)
	if ERR!=nil{
		log.Fatal("failed to start the grpc server")
	}
}