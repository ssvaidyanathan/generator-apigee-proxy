FROM maven:3.6.1

ARG quiet='-q -y -o Dpkg::Use-Pty=0'
RUN apt-get update $quiet &&\
    apt-get install $quiet curl &&\
    curl -sL https://deb.nodesource.com/setup_10.x |  bash - &&\
    apt-get update $quiet  &&\
    apt-get install $quiet nodejs

RUN npm install -g apigeelint &&\
    apigeelint -V

ENTRYPOINT ["bash", "-c"]